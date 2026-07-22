-- ==========================================================================
-- XENIOS RESEARCH - TRACK A: PRIVATE MEMBER PLATFORM (migrations 9-19)
-- ==========================================================================
-- The member-platform-only apply for the private launch. Excludes ALL commerce
-- (migrations 20-26 = Track B). Migrations 1-8 are already RUN in production.
--
-- Every statement is idempotent (create table/column if not exists), enables
-- row level security, and adds NO policy: access is service-role only by design
-- (the server uses the Supabase service role, which bypasses RLS; no client
-- role ever touches these tables). Adding a public policy would be a security
-- regression. No destructive DDL. Verified commerce-independent: no table here
-- references a commerce table, so this applies cleanly without Track B.
--
-- Apply in the Supabase SQL Editor (production project) AFTER review, then run
-- research-track-a-verification.sql (every check must return zero rows / the
-- presence roll-up must show rls_disabled = 0).
-- ==========================================================================


-- --------------------------------------------------------------------------
-- MIGRATION 9: research-member-billing.sql  (member billing_state column (additive; read defensively))
-- --------------------------------------------------------------------------

-- xenios research member billing state (ACCOUNT-EMAIL-SYSTEMS-001).
-- Run once in the Supabase SQL Editor. Safe to re-run. NOT YET RUN: the code
-- ships tolerant of this migration being absent (a missing billing_state
-- column reads as 'not_started' / verified-legacy for already-active members).
--
-- 1. Widens research_members.status with the dunning/cancellation states the
--    membership lifecycle needs (past_due, cancelled). No existing rows change.
-- 2. Adds billing_state, tracked SEPARATELY from membership status: a single
--    generic "active" cannot represent dunning, refunds, or disputes.

alter table public.research_members
  drop constraint if exists research_members_status_check;
alter table public.research_members
  add constraint research_members_status_check
  check (status in ('pending_activation','active','past_due','paused','cancelled','closed'));

alter table public.research_members
  add column if not exists billing_state text not null default 'not_started'
  check (billing_state in ('not_started','activation_pending','subscription_pending',
                           'active','past_due','cancelled','refunded','disputed'));

-- Members activated through the admin-verified interim flow (both payment
-- references attested) are billing-verified by definition of that flow.
update public.research_members set billing_state = 'active'
  where status = 'active' and billing_state = 'not_started';

-- --------------------------------------------------------------------------
-- MIGRATION 10: research-agreements.sql  (agreement acceptances (append-only))
-- --------------------------------------------------------------------------

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

-- --------------------------------------------------------------------------
-- MIGRATION 11: research-member-profile.sql  (member profile sections)
-- --------------------------------------------------------------------------

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

-- --------------------------------------------------------------------------
-- MIGRATION 12: research-assessment.sql  (assessment responses)
-- --------------------------------------------------------------------------

-- xenios research member platform: assessment responses (G3).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- RLS on, no public policies: only the server's service-role client reads or
-- writes here. Answers are health-adjacent and are keyed by questionId inside
-- one jsonb object; they never appear in logs or notification payloads.

create extension if not exists "pgcrypto";

-- One response per member per definition per mode. The initial assessment is
-- created in_progress on first open (or by the reminder sweep, with a null
-- started_at) and locked by submission; reminders_sent tracks the 0h/24h/48h/
-- 72h milestone emails after activation.
create table if not exists public.research_assessment_responses (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null,
  definition_id      text not null,
  definition_version int  not null,
  mode               text not null check (mode in ('initial','monthly_check_in')),
  status             text not null default 'in_progress' check (status in ('in_progress','submitted')),
  answers            jsonb not null default '{}'::jsonb,
  started_at         timestamptz,
  last_saved_at      timestamptz,
  submitted_at       timestamptz,
  reminders_sent     int not null default 0,
  created_at         timestamptz default now(),
  unique (member_id, definition_id, mode)
);

-- The reminder sweep scans by definition, mode, and status.
create index if not exists research_assessment_sweep_idx
  on public.research_assessment_responses (definition_id, mode, status);

alter table public.research_assessment_responses enable row level security;

-- --------------------------------------------------------------------------
-- MIGRATION 13: research-blueprint.sql  (blueprints (state machine))
-- --------------------------------------------------------------------------

-- xenios research member platform: Whole-Life Blueprint versions (G4).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- RLS on, no public policies: only the server's service-role client reads or
-- writes here. `content` carries the engine output (the BlueprintView payload
-- minus state and version) as one jsonb object; it is health-derived and is
-- never logged and never placed in notification payloads. `review_comment` is
-- Samuel's internal note and is never returned to members.

create extension if not exists "pgcrypto";

-- One row per member per blueprint version. Rows exist from the preliminary
-- state onward (the earlier states are derived from the assessment). The
-- state machine lives in shared/research/member-platform.ts
-- (BLUEPRINT_TRANSITIONS); transitions are server-owned and optimistic
-- (guarded updates on the current state).
create table if not exists public.research_blueprints (
  id                     uuid primary key default gen_random_uuid(),
  member_id              uuid not null,
  version                int  not null default 1,
  state                  text not null check (state in (
                           'not_started',
                           'assessment_due',
                           'assessment_submitted',
                           'preliminary',
                           'samuel_review',
                           'more_information_needed',
                           'published',
                           'updated'
                         )),
  content                jsonb not null,
  assessment_response_id uuid,
  reviewed_by            text,
  review_comment         text,
  member_visible_message text,
  published_at           timestamptz,
  superseded_by_version  int,
  member_acknowledged_at timestamptz,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now(),
  unique (member_id, version)
);

-- The admin review queue scans by state; member reads scan newest-first.
create index if not exists research_blueprints_state_idx
  on public.research_blueprints (state);
create index if not exists research_blueprints_member_version_idx
  on public.research_blueprints (member_id, version desc);

alter table public.research_blueprints enable row level security;

-- --------------------------------------------------------------------------
-- MIGRATION 14: research-plans.sql  (Xenios 30/90 + plan changes)
-- --------------------------------------------------------------------------

-- xenios research member platform: Xenios 30 / Xenios 90 plans + the one
-- included early plan change per month (Website 2 lane, Wave 2).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- RLS on, no public policies: only the server's service-role client reads or
-- writes here. Plan content is member-specific coaching material; members see
-- it only through the server routes, and only once published.

create extension if not exists "pgcrypto";

-- Monthly Xenios 30 plans. Publication is versioned per member per month:
-- publishing a newer version marks the earlier published one superseded, so
-- at most one published version per month is current. The content jsonb is
-- the Xenios30Plan payload minus the column-owned fields (planId, state,
-- version, monthLabel, reviewedBy, publishedAt, memberAcknowledgedAt).
-- Recommendation entries inside content reference product slugs and
-- dispositions only, never composition or dosing claims.
create table if not exists public.research_xenios30_plans (
  id                     uuid primary key default gen_random_uuid(),
  member_id              uuid not null,
  month_label            text not null check (month_label ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  version                int  not null default 1,
  state                  text not null default 'draft'
                         check (state in ('draft','samuel_review','published','superseded','archived')),
  content                jsonb not null default '{}'::jsonb,
  reviewed_by            text,
  published_at           timestamptz,
  member_acknowledged_at timestamptz,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now(),
  unique (member_id, month_label, version)
);

-- Member reads filter by member, then pick by state.
create index if not exists research_xenios30_member_state_idx
  on public.research_xenios30_plans (member_id, state);

-- Ninety-day arcs. One published version per member is current; publishing a
-- newer version supersedes the earlier one. The content jsonb is the
-- Xenios90Plan payload minus the column-owned fields (planId, state, version,
-- currentPhase, publishedAt).
create table if not exists public.research_xenios90_plans (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null,
  version       int  not null default 1,
  state         text not null default 'draft'
                check (state in ('draft','samuel_review','published','superseded','archived')),
  current_phase text not null check (current_phase in ('foundation','progression','consolidation')),
  content       jsonb not null default '{}'::jsonb,
  published_at  timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (member_id, version)
);

create index if not exists research_xenios90_member_state_idx
  on public.research_xenios90_plans (member_id, state);

-- The one included early plan change per calendar month. The unique
-- constraint IS the business rule: a second request in the same month cannot
-- exist, no matter how the request arrives, so the limit is structural rather
-- than best-effort application logic.
create table if not exists public.research_plan_change_requests (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null,
  month_label text not null check (month_label ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  reason      text not null,
  created_at  timestamptz default now(),
  unique (member_id, month_label)
);

alter table public.research_xenios30_plans enable row level security;
alter table public.research_xenios90_plans enable row level security;
alter table public.research_plan_change_requests enable row level security;

-- --------------------------------------------------------------------------
-- MIGRATION 15: research-documents.sql  (plan documents)
-- --------------------------------------------------------------------------

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

-- --------------------------------------------------------------------------
-- MIGRATION 16: research-tracker.sql  (tracker observations)
-- --------------------------------------------------------------------------

-- xenios research member platform: tracker observations (G5).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- RLS on, no public policies: only the server's service-role client reads or
-- writes here. Observations are health-adjacent member content; they are never
-- logged and never placed in notification payloads.
--
-- THERE IS NO COMPOSITE HEALTH SCORE COLUMN, HERE OR ANYWHERE. The six domains
-- are stored and reported side by side. Nothing in this schema combines them
-- into a single number to grow.

create extension if not exists "pgcrypto";

-- One row per observation. `original_value` keeps exactly what the member
-- wrote; `normalized_value` is the number the charts read, and it is null when
-- the entry was words rather than a number (confidence then drops to 'low').
-- The member's words are never discarded and never guessed at.
--
-- `metric_key` allows the full contract vocabulary including data_completeness
-- so the column and shared/research/member-platform.ts stay in step, but the
-- API refuses a member-submitted data_completeness row: that metric is COMPUTED
-- from coverage of the other five domains at read time and is never stored.
--
-- `source` covers the media pipeline's writers (voice_note, photo, video) and
-- the server's own computed writes (system) as well as the member's manual
-- entries; the tracker write route only ever produces 'manual'.
create table if not exists public.research_tracker_observations (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid not null,
  metric_key       text not null check (metric_key in (
                     'plan_adherence',
                     'body_and_appearance',
                     'sleep_and_recovery',
                     'energy_stress_vitality',
                     'performance_and_function',
                     'data_completeness'
                   )),
  source           text not null check (source in (
                     'manual',
                     'voice_note',
                     'photo',
                     'video',
                     'system'
                   )),
  recorded_at      timestamptz not null,
  timezone         text not null,
  unit             text,
  original_value   text not null,
  normalized_value numeric,
  confidence       text check (confidence in ('low', 'medium', 'high')) default 'high',
  notes            text,
  plan_id          uuid,
  created_at       timestamptz not null default now()
);

-- The progress view reads one member's window, per metric domain, newest first.
create index if not exists research_tracker_observations_member_metric_idx
  on public.research_tracker_observations (member_id, metric_key, recorded_at desc);

-- The whole-window read (every domain at once) and the completeness count.
create index if not exists research_tracker_observations_member_recorded_idx
  on public.research_tracker_observations (member_id, recorded_at desc);

alter table public.research_tracker_observations enable row level security;

-- --------------------------------------------------------------------------
-- MIGRATION 17: research-media.sql  (private media + access log (inert until media storage on))
-- --------------------------------------------------------------------------

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

-- --------------------------------------------------------------------------
-- MIGRATION 18: research-questions.sql  (questions + Telegram links (inert until Telegram on))
-- --------------------------------------------------------------------------

-- xenios research member platform: member questions and the Telegram link
-- (Website 2 lane, Wave 5).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- RLS on, no public policies: only the server's service-role client reads or
-- writes here. Members reach their own questions only through the server
-- routes, which scope every read and write by the session's member id.
--
-- HARD RULES this schema exists to keep honest:
-- - No queue position, anywhere. There is no column for a rank, a place in
--   line, or a count of anyone else's work, because a member is never shown
--   how many people are ahead of them and the server has nothing to serialize
--   even if a payload tried.
-- - sla_target_at is a TARGET, not a promise. It exists so Samuel's queue can
--   sort by what is aging, not so the member is told an answer is guaranteed
--   by a clock.
-- - A closed question is not reopened. A member who wants to continue files a
--   follow-up, linked by follow_up_of_question_id, so the record of what was
--   asked and answered stays intact.
-- - The raw link token is NEVER stored. Only its SHA-256 hash lands here, so a
--   database copy cannot be replayed to link a chat to a member's account.
-- - Telegram is never the system of record. chat_ref and display_name are
--   routing and display details; the questions, answers, and everything else
--   live in the tables above and in the member's account.

create extension if not exists "pgcrypto";

-- One row per question a member asked, whatever door it came through.
-- answered_by holds a DISPLAY NAME only ("Samuel"), never an admin email
-- address, because this row is serialized to the member who asked.
create table if not exists public.research_member_questions (
  id                      uuid primary key default gen_random_uuid(),
  member_id               uuid not null,
  -- Not null with a default: the frozen contract types category as required,
  -- so a row without one would serialize a shape the UI cannot receive.
  category                text not null default 'other' check (category in (
                            'plan',
                            'product',
                            'account',
                            'shipping',
                            'privacy',
                            'other'
                          )),
  -- The member overview counts open questions off this column, so it is not
  -- nullable and it defaults to the state a brand new question is really in.
  status                  text not null default 'pending' check (status in (
                            'pending',
                            'being_reviewed',
                            'more_information_needed',
                            'answer_ready',
                            'completed'
                          )),
  source                  text not null default 'web' check (source in (
                            'web',
                            'telegram_text',
                            'telegram_voice'
                          )),
  body_text               text,
  -- A voice question carries a reference to its transcript in the private
  -- media table rather than the audio or the text itself.
  transcript_media_id     uuid,
  answer_text             text,
  answered_at             timestamptz,
  answered_by             text,
  rating                  int check (rating between 1 and 5),
  -- Set when this question continues a COMPLETED one. Closed questions get
  -- linked follow-ups rather than being reopened.
  follow_up_of_question_id uuid,
  sla_target_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- The member's own list, newest first.
create index if not exists research_member_questions_member_created_idx
  on public.research_member_questions (member_id, created_at desc);

-- Samuel's queue: what is open, ordered by what is aging fastest.
create index if not exists research_member_questions_status_sla_idx
  on public.research_member_questions (status, sla_target_at);

-- The one-time Telegram link. A row is minted when the member asks to link,
-- and is spent exactly once when the bot presents the matching token.
--
-- link_token_hash is the SHA-256 of the token. The raw token is shown to the
-- member once, in the response that mints it, and is never written down here
-- or anywhere else. The unique constraint is what makes a duplicate token
-- impossible to insert; used_at is what makes a replay impossible to spend.
create table if not exists public.research_telegram_links (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null,
  link_token_hash text not null unique,
  chat_ref        text,
  display_name    text,
  linked_at       timestamptz,
  revoked_at      timestamptz,
  expires_at      timestamptz not null,
  used_at         timestamptz,
  created_at      timestamptz default now()
);

create index if not exists research_telegram_links_member_idx
  on public.research_telegram_links (member_id);

-- One active link per chat, enforced by the database rather than by a query
-- that hopes for a single row. Without this, a chat could resolve to two
-- members and a message could be attributed to the wrong one.
create unique index if not exists research_telegram_links_active_chat_idx
  on public.research_telegram_links (chat_ref)
  where used_at is not null and revoked_at is null and chat_ref is not null;

alter table public.research_member_questions enable row level security;
alter table public.research_telegram_links enable row level security;

-- --------------------------------------------------------------------------
-- MIGRATION 19: research-sla-events.sql  (SLA escalation ledger (inert until Infinity emit on))
-- --------------------------------------------------------------------------

-- xenios research member platform: the SLA event ledger (Website 2 lane,
-- Wave 5).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- RLS on, no policies: only the server's service-role client reads or writes
-- here. Nothing in this table is member-facing.
--
-- WHAT THIS TABLE IS: the claim ledger for SLA notifications sent to Infinity.
-- One row means "this subject's at-risk (or breach) notification has been
-- claimed by a sweep". The unique constraint IS the idempotency: a subject
-- emits at_risk once and breached once, ever, no matter how many sweeps run,
-- how many workers run them, or how late they run.
--
-- WHAT THIS TABLE IS NOT: it is not a copy of member data. There is no column
-- for a name, an email, a health answer, a question body, or a token, because
-- none of those may cross the Infinity boundary (see infinity-provider.ts).
-- subject_ref is an opaque internal reference and subject_id is the uuid the
-- unique constraint is built on.
--
-- delivered = false means the claim exists but the provider refused (disabled,
-- unconfigured, or a transport error). A later sweep RETRIES the delivery
-- against the same claim; the claim is never deleted, so a flapping provider
-- can never produce a duplicate notification.

create extension if not exists "pgcrypto";

create table if not exists public.research_sla_events (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in (
                 'assessment_deadline',
                 'blueprint_review',
                 'monthly_plan_review',
                 'question_response'
               )),
  -- Opaque routing reference (member id, blueprint id, plan id, question id).
  subject_ref  text not null,
  -- NOT NULL is load bearing: Postgres treats NULLs as distinct in a unique
  -- constraint, so a nullable column here would silently allow unlimited
  -- duplicate claims and defeat the idempotency this table exists to provide.
  subject_id   uuid not null,
  deadline_at  timestamptz not null,
  phase        text not null check (phase in ('at_risk', 'breached')),
  emitted_at   timestamptz not null default now(),
  -- False until the provider confirms the emit. A retry sweep flips it true;
  -- it never causes a second claim.
  delivered    boolean not null default false,
  unique (kind, subject_id, phase)
);

-- The retry sweep's read: undelivered claims, oldest first.
create index if not exists research_sla_events_undelivered_idx
  on public.research_sla_events (delivered, emitted_at);

-- The admin sla_risk queue's read: what fired for this kind and when.
create index if not exists research_sla_events_kind_emitted_idx
  on public.research_sla_events (kind, emitted_at desc);

alter table public.research_sla_events enable row level security;
