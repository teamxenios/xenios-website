-- PREFLIGHT: detect the production state of the Private Early Access durable
-- session schema BEFORE applying anything.
--
-- READ ONLY. This script creates nothing, alters nothing, and drops nothing. It
-- is safe to run against production, and safe to run repeatedly.
--
-- Why this exists: supabase/MIGRATIONS.md says the Early Access session
-- migration has never been run, and it declares itself the source of truth. But
-- a ledger is a human record. A migration applied by hand, or applied and then
-- not recorded, leaves exactly the trace we observe. The database itself is the
-- only authority on what the database contains, so the decision is made here.
--
-- Run:  psql "<production connection string>" -f preflight-private-early-access-sessions.sql
-- Or paste into the Supabase SQL editor. Read the single CASE line at the end.

\pset pager off

-- ---------------------------------------------------------------------------
-- 1. Objects
-- ---------------------------------------------------------------------------
select 'TABLES' as section,
       c.relname as name,
       c.relpersistence as persistence,   -- 'p' permanent, 'u' unlogged, 't' temp
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'research_private_early_access_sessions',
    'research_private_early_access_nonces'
  )
order by c.relname;

select 'COLUMNS' as section, c.relname as table_name, a.attname as column_name,
       pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type, a.attnotnull as not_null
from pg_catalog.pg_attribute a
join pg_catalog.pg_class c on c.oid = a.attrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname like 'research_private_early_access_%'
  and a.attnum > 0 and not a.attisdropped
order by c.relname, a.attnum;

-- The expiry constraint is the tell that distinguishes the 15-minute schema
-- from the 240-minute one.
select 'CONSTRAINTS' as section, c.relname as table_name, con.conname as constraint_name,
       pg_catalog.pg_get_constraintdef(con.oid) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'research_private_early_access_%'
order by c.relname, con.conname;

select 'INDEXES' as section, tablename, indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public' and tablename like 'research_private_early_access_%'
order by tablename, indexname;

-- ---------------------------------------------------------------------------
-- 2. Functions, their exact signatures, and their security properties
-- ---------------------------------------------------------------------------
select 'FUNCTIONS' as section,
       p.proname as name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) as signature,
       pg_catalog.pg_get_function_result(p.oid) as returns,
       p.prosecdef as security_definer,
       pg_catalog.pg_get_userbyid(p.proowner) as owner,
       coalesce(pg_catalog.array_to_string(p.proconfig, ', '), '(none)') as config,
       -- The lifetime the exchange function actually authors.
       case
         when p.proname <> 'research_private_early_access_exchange_nonce' then null
         when pg_catalog.strpos(pg_catalog.pg_get_functiondef(p.oid), 'interval ''240 minutes''') > 0 then '240 minutes'
         when pg_catalog.strpos(pg_catalog.pg_get_functiondef(p.oid), 'interval ''15 minutes''') > 0 then '15 minutes'
         else 'UNRECOGNISED'
       end as session_lifetime
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'research_private_early_access_%'
order by p.proname;

-- ---------------------------------------------------------------------------
-- 3. Privileges. Any row here for a browser-reachable role is a finding.
-- ---------------------------------------------------------------------------
select 'TABLE_PRIVILEGES' as section, grantee, table_name, privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name like 'research_private_early_access_%'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, table_name, privilege_type;

select 'COLUMN_PRIVILEGES' as section, grantee, table_name, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name like 'research_private_early_access_%'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, table_name, column_name;

select 'FUNCTION_PRIVILEGES' as section, r.rolname as grantee, p.proname as function_name
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
cross join pg_catalog.pg_roles r
where n.nspname = 'public'
  and p.proname like 'research_private_early_access_%'
  and r.rolname in ('anon', 'authenticated')
  and pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE')
order by r.rolname, p.proname;

-- ---------------------------------------------------------------------------
-- 4. Any migration history table this project keeps
-- ---------------------------------------------------------------------------
select 'MIGRATION_HISTORY_TABLES' as section, n.nspname as schema_name, c.relname as table_name
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and (c.relname ilike '%migration%' or n.nspname = 'supabase_migrations')
order by n.nspname, c.relname;

-- ---------------------------------------------------------------------------
-- 5. THE VERDICT
-- ---------------------------------------------------------------------------
with objects as (
  select
    (select count(*) from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('research_private_early_access_sessions',
                          'research_private_early_access_nonces')) as table_count,
    (select count(*) from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('research_private_early_access_issue_nonce',
                          'research_private_early_access_exchange_nonce',
                          'research_private_early_access_session_active',
                          'research_private_early_access_revoke_session')) as function_count,
    (select count(*) from pg_catalog.pg_constraint con
       join pg_catalog.pg_class c on c.oid = con.conrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and con.conname = 'research_private_early_access_sessions_expiry_exact'
        and pg_catalog.pg_get_constraintdef(con.oid) like '%04:00:00%') as expiry_240,
    (select count(*) from pg_catalog.pg_constraint con
       join pg_catalog.pg_class c on c.oid = con.conrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and con.conname = 'research_private_early_access_sessions_expiry_exact'
        and pg_catalog.pg_get_constraintdef(con.oid) like '%00:15:00%') as expiry_15,
    (select count(*) from information_schema.table_privileges
      where table_schema = 'public'
        and table_name like 'research_private_early_access_%'
        and grantee in ('PUBLIC', 'anon', 'authenticated')) as leaked_grants
)
select
  case
    when table_count = 0 and function_count = 0
      then 'CASE A: no Early Access durable-session objects exist. Apply research-private-early-access-sessions.sql (240-minute form).'
    when table_count = 2 and function_count = 4 and expiry_240 = 1 and expiry_15 = 0
      then 'CASE C: the complete 240-minute objects already exist. No migration required.'
    when table_count = 2 and function_count = 4 and expiry_15 = 1
      then 'CASE B: the earlier 15-minute objects exist. Apply research-private-early-access-session-ttl-240.sql.'
    else 'CASE D: PARTIAL OR DRIFTED INSTALLATION. Do not apply anything. Read the sections above and repair deliberately.'
  end as detected_case,
  table_count, function_count, expiry_240, expiry_15,
  case when leaked_grants > 0
       then 'FINDING: a browser-reachable role holds a grant on these tables. Investigate before proceeding.'
       else 'no browser-reachable grants' end as privilege_finding
from objects;
