-- Read-only postcheck for 20260820_research_affiliate_declared_codes.sql.
-- DEPLOYED_AND_LOCKED only when the table exists with RLS enabled, the
-- one-capture unique index is present, the public roles hold nothing, and
-- service_role holds exactly SELECT and INSERT.
with table_state as (
  select
    c.relrowsecurity as rls_enabled,
    to_regclass('public.research_affiliate_declared_codes_one_capture') is not null as capture_index_exists
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'research_affiliate_declared_codes'
), privileges as (
  select
    has_table_privilege('service_role', 'public.research_affiliate_declared_codes', 'SELECT') as sr_select,
    has_table_privilege('service_role', 'public.research_affiliate_declared_codes', 'INSERT') as sr_insert,
    has_table_privilege('service_role', 'public.research_affiliate_declared_codes', 'UPDATE') as sr_update,
    has_table_privilege('service_role', 'public.research_affiliate_declared_codes', 'DELETE') as sr_delete,
    has_table_privilege('service_role', 'public.research_affiliate_declared_codes', 'TRUNCATE') as sr_truncate,
    has_table_privilege('anon', 'public.research_affiliate_declared_codes', 'SELECT') as anon_select,
    has_table_privilege('anon', 'public.research_affiliate_declared_codes', 'INSERT') as anon_insert,
    has_table_privilege('authenticated', 'public.research_affiliate_declared_codes', 'SELECT') as auth_select,
    has_table_privilege('authenticated', 'public.research_affiliate_declared_codes', 'INSERT') as auth_insert
  where to_regclass('public.research_affiliate_declared_codes') is not null
)
select jsonb_build_object(
  'verdict', case
    when table_state.rls_enabled
     and table_state.capture_index_exists
     and privileges.sr_select and privileges.sr_insert
     and not privileges.sr_update and not privileges.sr_delete and not privileges.sr_truncate
     and not privileges.anon_select and not privileges.anon_insert
     and not privileges.auth_select and not privileges.auth_insert
    then 'DEPLOYED_AND_LOCKED'
    else 'STOP_PRIVILEGES_INCORRECT'
  end,
  'rlsEnabled', table_state.rls_enabled,
  'oneCaptureIndex', table_state.capture_index_exists,
  'serviceRole', jsonb_build_object(
    'select', privileges.sr_select,
    'insert', privileges.sr_insert,
    'update', privileges.sr_update,
    'delete', privileges.sr_delete,
    'truncate', privileges.sr_truncate
  ),
  'anon', jsonb_build_object('select', privileges.anon_select, 'insert', privileges.anon_insert),
  'authenticated', jsonb_build_object('select', privileges.auth_select, 'insert', privileges.auth_insert)
) as affiliate_declared_codes_postcheck
from table_state
cross join privileges;
