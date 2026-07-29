\set ON_ERROR_STOP on

-- Disposable-database bootstrap for research-rls-retro-hardening.verify.sql.
-- Modeled on the research-pricing-lineage and research-inventory-* pairs:
-- create the Supabase roles, simulate the Supabase default privileges that
-- hand every new table to the browser roles, then apply the EXACT in-tree
-- source scripts (verbatim, via \ir) for a representative sample of every
-- old-generation group the retro-hardening migration enumerates:
--
--   Group 1  schema.sql (all five main-site tables)
--   Group 2  research-membership.sql, research-members.sql,
--            research-referrals.sql (all eight tables)
--   Group 3  production/research-track-a-private-platform.sql (all 15 tables)
--   Group 4  production/research-founding-membership.sql (all 18 FM-1 tables;
--            FM-7's research_fm_agreement_email_candidates is deliberately
--            NOT created so the verifier can prove the absent-table no-op)
--   Group 5  research-orders.sql (all eight PENDING commerce tables; the
--            other PENDING commerce scripts are deliberately NOT applied,
--            again to prove the absent-table no-op)
--   Group 6  deliberately NOT applied (absent-table no-op coverage)
--
-- care-access-foundation.sql is also applied verbatim so the verifier can
-- prove the sole-policy invariant and that the two documented Care read
-- surfaces survive the hardening untouched. It references auth.users and
-- auth.uid(), so a minimal auth stub is created first.
--
-- Local disposable Docker PostgreSQL only. Never production.

create extension if not exists pgcrypto;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated, service_role;

-- Minimal stand-in for the Supabase-managed auth schema referenced by
-- care-access-foundation.sql (auth.users foreign keys and auth.uid()).
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid()
);
create or replace function auth.uid() returns uuid
language sql stable
as $$ select null::uuid $$;

-- Simulate the Supabase default privileges: every table, sequence, and
-- function created after this point automatically receives browser-role and
-- server-role grants, exactly the production posture this lane retrofits.
-- The grantor is the bootstrap role, which is also the role that will apply
-- the candidate migration, matching production where the postgres role owns
-- both the defaults and the migration run.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Apply the exact in-tree sources, in MIGRATIONS.md ledger order.
\ir ../schema.sql
\ir ../research-membership.sql
\ir ../research-members.sql
\ir ../research-referrals.sql
\ir ../production/research-track-a-private-platform.sql
\ir ../production/research-founding-membership.sql
\ir ../research-orders.sql
\ir ../care-access-foundation.sql

-- Seed two rows so the verifier can prove the candidate changes zero data.
insert into public.waitlist_signups (id, name, email, consent)
values (
  '90000000-0000-4000-8000-000000000001',
  'RLS Hardening Probe',
  'rls-probe@xenios.test',
  true
);
insert into public.research_applications (id, email, first_name, last_name, country)
values (
  '90000000-0000-4000-8000-000000000002',
  'rls-probe-applicant@xenios.test',
  'Probe',
  'Applicant',
  'US'
);
