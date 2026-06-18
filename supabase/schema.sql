-- xenios — Supabase schema (v3)
-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query -> paste -> Run).
-- Safe to re-run: uses IF NOT EXISTS / idempotent guards.
-- Security model: RLS is ENABLED on every table with NO public policies, so the
-- anon/auth keys cannot read or write. All app access goes through the server using
-- the service_role key (which bypasses RLS). Admin reads/writes are gated server-side.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- waitlist_signups  (email unique, upsert on duplicate)
-- ---------------------------------------------------------------------------
create table if not exists public.waitlist_signups (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  email         text not null unique,
  phone         text,
  role          text,
  company       text,
  city          text,
  handle_or_url text,
  client_count  text,
  interest      text,
  consent       boolean not null default false,
  status        text not null default 'New'
                  check (status in ('New','Contacted','Qualified','Not a fit','Converted','Archived')),
  email_status  text check (email_status in ('sent','failed')),
  source_page   text,
  landing_page  text,
  referrer_url  text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  ip            text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists waitlist_signups_created_at_idx on public.waitlist_signups (created_at desc);
create index if not exists waitlist_signups_status_idx on public.waitlist_signups (status);

-- ---------------------------------------------------------------------------
-- loi_submissions  (KEEP HISTORY — no dedupe, multiple rows per email allowed)
-- ---------------------------------------------------------------------------
create table if not exists public.loi_submissions (
  id             uuid primary key default gen_random_uuid(),
  name           text,
  email          text,
  phone          text,
  business_name  text,
  role           text,
  url_or_handle  text,
  client_count   text,
  why_interested text,
  nonbinding_ack boolean not null default false,
  status         text not null default 'New'
                   check (status in ('New','Reviewing','Followed up','Signed','Not moving forward')),
  email_status   text check (email_status in ('sent','failed')),
  source_page    text,
  landing_page   text,
  referrer_url   text,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  utm_content    text,
  utm_term       text,
  ip             text,
  created_at     timestamptz not null default now()
);
create index if not exists loi_submissions_created_at_idx on public.loi_submissions (created_at desc);
create index if not exists loi_submissions_email_idx on public.loi_submissions (email);

-- ---------------------------------------------------------------------------
-- calendly_bookings
-- ---------------------------------------------------------------------------
create table if not exists public.calendly_bookings (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  email       text,
  event_time  timestamptz,
  source      text,
  status      text not null default 'Booked',
  created_at  timestamptz not null default now()
);
create index if not exists calendly_bookings_created_at_idx on public.calendly_bookings (created_at desc);

-- ---------------------------------------------------------------------------
-- admin_notes  (threaded notes per record)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_notes (
  id          uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('waitlist','loi','booking')),
  record_id   uuid not null,
  note        text not null,
  author      text,
  created_at  timestamptz not null default now()
);
create index if not exists admin_notes_record_idx on public.admin_notes (record_type, record_id, created_at);

-- ---------------------------------------------------------------------------
-- concept_gallery_items
-- ---------------------------------------------------------------------------
create table if not exists public.concept_gallery_items (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  image_url   text,
  status      text not null default 'Concept'
                check (status in ('Concept','In development','Live')),
  date        text,
  visible     boolean not null default true,
  sort_order  integer not null default 0
);
create index if not exists concept_gallery_items_sort_idx on public.concept_gallery_items (sort_order);

-- ---------------------------------------------------------------------------
-- Row-Level Security: enable everywhere, define no public policies.
-- (service_role bypasses RLS; anon/auth get no access.)
-- ---------------------------------------------------------------------------
alter table public.waitlist_signups     enable row level security;
alter table public.loi_submissions       enable row level security;
alter table public.calendly_bookings     enable row level security;
alter table public.admin_notes           enable row level security;
alter table public.concept_gallery_items enable row level security;
