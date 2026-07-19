-- xenios research notification outbox (Mega 1 section 3). Run once in the
-- Supabase SQL Editor. Safe to re-run. RLS on, no public policies.
-- The outbox makes every notification durable: an application can never lose
-- its emails to a transient provider failure, and every attempt is visible.

create extension if not exists "pgcrypto";

create table if not exists public.research_notification_outbox (
  id                  uuid primary key default gen_random_uuid(),
  event_key           text not null unique,
  application_id      uuid,
  member_id           uuid,
  event_type          text not null,
  channel             text not null default 'email',
  recipient           text not null,
  template_key        text not null,
  payload             jsonb not null default '{}'::jsonb,
  status              text not null default 'pending'
                        check (status in ('pending','processing','sent','delivered',
                                          'failed_retryable','failed_permanent','cancelled')),
  attempt_count       integer not null default 0,
  next_attempt_at     timestamptz not null default now(),
  last_attempt_at     timestamptz,
  provider_message_id text,
  last_error_code     text,
  last_error_summary  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz
);
create index if not exists research_outbox_due_idx
  on public.research_notification_outbox (status, next_attempt_at);
create index if not exists research_outbox_application_idx
  on public.research_notification_outbox (application_id);

create table if not exists public.research_notification_attempts (
  id          uuid primary key default gen_random_uuid(),
  outbox_id   uuid not null references public.research_notification_outbox (id) on delete cascade,
  attempt     integer not null,
  outcome     text not null,
  error_code  text,
  error_summary text,
  created_at  timestamptz not null default now()
);
create index if not exists research_attempts_outbox_idx
  on public.research_notification_attempts (outbox_id, created_at);

-- Google Drive / Sheets export tracking (Mega 3 contract; exports stay
-- disabled until RESEARCH_GOOGLE_WORKSPACE_EXPORTS_ENABLED=true).
create table if not exists public.research_external_exports (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null,
  export_kind     text not null check (export_kind in ('drive-folder','sheet-row')),
  drive_folder_id text,
  file_ids        jsonb,
  export_version  integer not null default 1,
  status          text not null default 'disabled'
                    check (status in ('disabled','pending','exporting','complete','retrying','failed')),
  last_exported_at timestamptz,
  last_error_summary text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (application_id, export_kind)
);

create table if not exists public.research_admin_notification_preferences (
  id          uuid primary key default gen_random_uuid(),
  admin_email text not null unique,
  immediate   jsonb not null default '{}'::jsonb,
  daily_digest boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table public.research_notification_outbox          enable row level security;
alter table public.research_notification_attempts        enable row level security;
alter table public.research_external_exports             enable row level security;
alter table public.research_admin_notification_preferences enable row level security;
