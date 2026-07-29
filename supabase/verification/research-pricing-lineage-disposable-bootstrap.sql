\set ON_ERROR_STOP on

-- Disposable-database bootstrap for research-pricing-lineage.verify.sql.
-- Modeled on research-inventory-lot-coa-disposable-bootstrap.sql: create the
-- Supabase roles, minimal replicas of the legacy tables that pre-exist the
-- Product Control migration in production, and a storage.buckets stub, then
-- apply the EXACT repo migrations that build the pricing authority substrate
-- (research_products alterations, research_product_variants,
-- research_product_prices with the one-active partial unique index and the
-- immutable-history trigger, forced RLS, and the privilege hardening).
--
-- Deliberately NOT created here: research_orders / research_order_lines.
-- Production has not run supabase/production/research-track-b-commerce.sql
-- (MIGRATIONS.md order 22, PENDING), so the default bootstrap matches
-- production and lets the verifier prove the candidate's table-absent no-op
-- branch before creating the dormant Track B order tables itself.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

-- Minimal stand-in for the Supabase-managed storage catalog referenced by the
-- Product Control migration's bucket upsert.
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

-- Minimal replicas of the legacy tables the Product Control migration alters
-- or governs. Only the columns its direct DDL touches are required; columns
-- referenced solely inside plpgsql command bodies are not needed to apply it.
create table public.research_products (
  id uuid primary key,
  sku text not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.research_product_content (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.research_products(id) on delete cascade,
  section text not null,
  state text not null default 'draft',
  heading text,
  body text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, section)
);

create table public.research_product_facts (
  id uuid primary key default gen_random_uuid()
);
create table public.research_product_goals (
  id uuid primary key default gen_random_uuid()
);
create table public.research_product_guide_links (
  id uuid primary key default gen_random_uuid()
);
create table public.research_product_prohibited_claims (
  id uuid primary key default gen_random_uuid()
);
create table public.research_product_open_questions (
  id uuid primary key default gen_random_uuid()
);
create table public.research_supplement_candidates (
  id uuid primary key default gen_random_uuid()
);

-- Apply the exact reviewed repo migrations that own the pricing authority.
\ir ../migrations/20260726143000_research_product_control_center.sql
\ir ../migrations/20260726214500_research_product_control_center_privilege_hardening.sql
