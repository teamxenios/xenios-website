\set ON_ERROR_STOP on

-- Disposable-only Supabase Storage shim for the Website 2 integration
-- migration. Production already owns storage.buckets. This file must never be
-- applied to production.
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

alter table public.research_product_variants
  add column if not exists shipping_class text;

create table if not exists public.research_members (
  id uuid primary key default gen_random_uuid()
);
create table if not exists public.research_membership_applications (
  id uuid primary key default gen_random_uuid()
);
create table if not exists public.research_notification_outbox (
  id uuid primary key default gen_random_uuid()
);
create table if not exists public.research_required_inputs (
  id uuid primary key default gen_random_uuid()
);
create table if not exists public.research_domain_launch_controls (
  id uuid primary key default gen_random_uuid()
);
create table if not exists public.care_capabilities (
  capability_key text primary key,
  enabled boolean not null
);
