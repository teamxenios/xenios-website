-- xenios research member platform: private media (progress photos, voice
-- notes, exercise videos) plus the access audit and the standing retention
-- election (Website 2 lane, Wave 4).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- RLS on, no public policies: only the server's service-role client reads or
-- writes here. Members reach their media only through the server routes, and
-- only through short-lived signed URLs minted per request.
--
-- HARD RULES this schema exists to keep honest:
-- - No facial recognition. `has_face_blurred_derivative` records that a blurred
--   IMAGE was produced. There is no column for a face template, embedding, or
--   descriptor anywhere, because none is ever computed or stored.
-- - No public URLs. Storage paths live in these columns and are NEVER returned
--   to a browser; the API returns signed URLs only.
-- - No advertising or analytics egress. Nothing here is exported to a
--   marketing or measurement destination.
-- - A failed processing job NEVER deletes the only safe copy. Raw deletion is
--   gated on processing_state = 'processed' plus the delete election.

create extension if not exists "pgcrypto";

-- One row per uploaded object. The row is created at intent time (state
-- 'uploaded') so an abandoned upload is still accounted for and sweepable.
-- retention_election is copied onto the row at intent from the member's
-- standing election, so the rule that applied to THIS upload is auditable even
-- after the member changes their standing preference later.
create table if not exists public.research_private_media (
  id                            uuid primary key default gen_random_uuid(),
  member_id                     uuid not null,
  kind                          text not null check (kind in (
                                  'progress_photo',
                                  'voice_note',
                                  'exercise_video'
                                )),
  processing_state              text not null default 'uploaded' check (processing_state in (
                                  'uploaded',
                                  'scanning',
                                  'processing',
                                  'processed',
                                  'processing_failed',
                                  'deleted'
                                )),
  retention_election            text not null check (retention_election in (
                                  'retain_raw',
                                  'delete_raw_after_processing'
                                )),
  raw_storage_path              text,
  derivative_storage_path       text,
  transcript_text               text,
  face_blur_requested           boolean not null default false,
  -- Set when a malware scan reports the object unclean. Access to every
  -- variant is refused for a quarantined row even if a storage delete was
  -- refused and the pointer is still present for a retry sweep.
  quarantined                   boolean not null default false,
  has_face_blurred_derivative   boolean default false,
  duration_seconds              int,
  captured_at                   timestamptz,
  uploaded_at                   timestamptz not null default now(),
  raw_deleted_at                timestamptz,
  created_at                    timestamptz default now()
);

-- The member's own list, newest first.
create index if not exists research_private_media_member_uploaded_idx
  on public.research_private_media (member_id, uploaded_at desc);

-- The access audit: one row per granted signed URL. Written BEFORE the URL is
-- minted, so there is no access without an audit record.
create table if not exists public.research_media_access_log (
  id          uuid primary key default gen_random_uuid(),
  media_id    uuid not null,
  member_id   uuid not null,
  variant     text not null check (variant in ('raw', 'face_blurred', 'transcript')),
  accessed_at timestamptz not null default now()
);

create index if not exists research_media_access_log_member_idx
  on public.research_media_access_log (member_id, accessed_at desc);
create index if not exists research_media_access_log_media_idx
  on public.research_media_access_log (media_id, accessed_at desc);

-- The member's STANDING retention election. Separate from the per-row copy so
-- the preference survives with no media rows (a member may choose before their
-- first upload) and so changing it never rewrites the historical record of what
-- applied to an earlier upload.
create table if not exists public.research_media_retention_elections (
  member_id          uuid primary key,
  retention_election text not null check (retention_election in (
                       'retain_raw',
                       'delete_raw_after_processing'
                     )),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

alter table public.research_private_media enable row level security;
alter table public.research_media_access_log enable row level security;
alter table public.research_media_retention_elections enable row level security;
