-- Disposable-database bootstrap for the 2026-08-19 Lane C cart-migration
-- rehearsal (scripts/verify-20260819-cart-migrations.sh).
--
-- Apply AFTER supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql
-- (the M71 role bootstrap), which owns the Supabase role set. This file adds
-- ONLY the managed-Supabase seams that a stock postgres:16/postgres:17
-- container lacks and that the DEPLOYED migration chain touches:
--
--   1. pgcrypto in a dedicated `extensions` schema — exactly where managed
--      Supabase installs it, and NOT in `public`. The cart migrations carry
--      history about this (M58 references public.digest inside plpgsql; M60
--      repairs it to extensions.digest), so a container with public.digest
--      present would make the rehearsal test an environment production does
--      not have. The harness proves public.digest is ABSENT before applying
--      anything.
--
--   2. A minimal storage.buckets stand-in, because two RUN migrations
--      (20260726143000 and 20260727120000) and one RUN root file
--      (research-products-diagnostics.sql) perform an UNGUARDED
--      `insert into storage.buckets ... on conflict (id)`. On managed
--      Supabase the storage schema is provided by the platform. Only the
--      columns those inserts name exist here; created only if absent.
--
--   3. Twelve stand-in functions for 20260814061500 (M68), which is
--      configuration-only: `alter function ... set search_path = ''` on
--      twelve functions whose CREATE lives in the root-level deployed files
--      (production/research-founding-membership.sql and friends), outside
--      supabase/migrations/. The rehearsal replays the migrations/ chain plus
--      the minimal root prefix the chain itself alters, which does not include
--      the founding-membership chain; these stand-ins carry the exact names
--      and signatures so M68's ALTERs bind and its post-condition can prove
--      proconfig, and nothing else. Their bodies never execute in this
--      rehearsal and none is attached to any trigger here. Each is created
--      ONLY if absent, so a database that already has the real function keeps
--      it untouched.
--
-- This file is never applied to production, where every one of these objects
-- already exists and is managed by Supabase or by the deployed root files.

-- ---------------------------------------------------------------------------
-- 0. Fail fast if the role bootstrap did not run first.
-- ---------------------------------------------------------------------------
do $require_roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception
      'apply research-assisted-order-bridge-disposable-bootstrap.sql (the role set) before this file'
      using errcode = '55000';
  end if;
end
$require_roles$;

-- ---------------------------------------------------------------------------
-- 1. pgcrypto in the extensions schema (the managed-Supabase shape).
-- ---------------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 2. Minimal storage.buckets stand-in.
-- ---------------------------------------------------------------------------
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

-- ---------------------------------------------------------------------------
-- 3. M68 stand-ins: exact names and signatures, created only if absent.
-- ---------------------------------------------------------------------------
do $m68_standins$
declare
  v_name text;
begin
  -- The eleven trigger guards.
  foreach v_name in array array[
    'research_fm_append_only',
    'research_fm_checklist_touch',
    'research_fm_esign_touch_updated_at',
    'research_fm_history_is_append_only',
    'research_fm_identity_audit_is_append_only',
    'research_fm_signature_requires_published',
    'research_fm_signatures_append_only',
    'research_fm_versions_guard',
    'research_fm_versions_no_delete',
    'research_ledger_is_append_only',
    'research_reject_product_request_event_mutation'
  ] loop
    if pg_catalog.to_regprocedure('public.' || v_name || '()') is null then
      execute pg_catalog.format(
        'create function public.%I() returns trigger language plpgsql as '
        || '$standin$ begin raise exception ''rehearsal stand-in for M68; never attached to a trigger''; return null; end $standin$',
        v_name);
    end if;
  end loop;

  -- The rate limiter, same signature as research-referral-fraud.sql.
  if pg_catalog.to_regprocedure('public.research_rate_limit_hit(text,integer,integer)') is null then
    create function public.research_rate_limit_hit(
      p_key text, p_window_seconds integer, p_max_hits integer
    ) returns boolean language plpgsql as
    $standin$ begin raise exception 'rehearsal stand-in for M68; never called'; return false; end $standin$;
  end if;
end
$m68_standins$;
