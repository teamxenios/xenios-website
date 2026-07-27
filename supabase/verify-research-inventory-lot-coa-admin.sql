\set ON_ERROR_STOP on

-- Read-only production verification for Research Commerce Wave 2 inventory,
-- lots, and exact-lot COA administration. This script creates no object and
-- invokes no mutating command.

do $verify$
declare
  expected_tables constant text[] := array[
    'research_inventory_lots',
    'research_lot_quality_documents',
    'research_lot_allocations',
    'research_inventory_movements',
    'research_inventory_lot_events',
    'research_lot_quality_tests',
    'research_lot_quality_events',
    'research_lot_quality_access_events'
  ];
  reviewed_functions constant text[] := array[
    'research_inventory_product_variant_projection',
    'research_inventory_product_variant_ready',
    'research_lot_quality_tests_ready',
    'research_authorize_lot_quality_access',
    'research_lot_is_allocatable',
    'research_lot_quality_ready',
    'research_create_inventory_lot',
    'research_prepare_lot_quality_upload',
    'research_cancel_lot_quality_upload',
    'research_apply_inventory_movement',
    'research_set_inventory_lot_disposition',
    'research_manage_lot_quality_document'
  ];
  actual integer;
begin
  select count(*) into actual
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(expected_tables)
    and c.relkind = 'r';
  if actual <> 8 then
    raise exception 'Wave 2 table count mismatch: %', actual;
  end if;

  select count(*) into actual
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(expected_tables)
    and c.relrowsecurity
    and c.relforcerowsecurity;
  if actual <> 8 then
    raise exception 'Wave 2 forced-RLS count mismatch: %', actual;
  end if;

  select count(*) into actual
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any(expected_tables)
    and grantee in ('PUBLIC', 'anon', 'authenticated');
  if actual <> 0 then
    raise exception 'Wave 2 browser table grants found: %', actual;
  end if;

  select count(*) into actual
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any(expected_tables)
    and grantee = 'service_role';
  if actual <> 8 then
    raise exception 'Wave 2 service table privilege mismatch: %', actual;
  end if;

  select count(*) into actual
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any(expected_tables)
    and grantee = 'service_role'
    and privilege_type <> 'SELECT';
  if actual <> 0 then
    raise exception 'Wave 2 direct service table mutation grant found: %', actual;
  end if;

  select count(*) into actual
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name = any(reviewed_functions)
    and grantee = 'service_role'
    and privilege_type = 'EXECUTE';
  if actual <> 12 then
    raise exception 'Wave 2 service RPC grant mismatch: %', actual;
  end if;

  select count(*) into actual
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name = any(reviewed_functions)
    and grantee in ('PUBLIC', 'anon', 'authenticated');
  if actual <> 0 then
    raise exception 'Wave 2 browser/public RPC grants found: %', actual;
  end if;

  select count(*) into actual
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any(reviewed_functions)
    and p.prosecdef
    and coalesce(p.proconfig, array[]::text[]) @> array['search_path=pg_catalog'];
  if actual <> 12 then
    raise exception 'Wave 2 fixed-search-path RPC mismatch: %', actual;
  end if;

  select count(*) into actual
  from storage.buckets
  where id = 'research-coa-production'
    and name = 'research-coa-production'
    and public = false
    and file_size_limit = 20971520
    and cardinality(allowed_mime_types) = 1
    and allowed_mime_types @> array['application/pdf']::text[]
    and allowed_mime_types <@ array['application/pdf']::text[];
  if actual <> 1 then
    raise exception 'Wave 2 private COA bucket mismatch: %', actual;
  end if;
end
$verify$;

select table_name, row_count
from (
  select 'research_inventory_lots'::text as table_name, count(*)::bigint as row_count
  from public.research_inventory_lots
  union all select 'research_lot_quality_documents', count(*)
  from public.research_lot_quality_documents
  union all select 'research_lot_allocations', count(*)
  from public.research_lot_allocations
  union all select 'research_inventory_movements', count(*)
  from public.research_inventory_movements
  union all select 'research_inventory_lot_events', count(*)
  from public.research_inventory_lot_events
  union all select 'research_lot_quality_tests', count(*)
  from public.research_lot_quality_tests
  union all select 'research_lot_quality_events', count(*)
  from public.research_lot_quality_events
  union all select 'research_lot_quality_access_events', count(*)
  from public.research_lot_quality_access_events
) counts
order by table_name;

select
  (select count(*) from public.research_members) as members,
  (select count(*) from public.research_membership_applications) as applications,
  (select count(*) from public.research_notification_outbox) as outbox,
  (select count(*) from public.research_required_inputs) as required_inputs,
  (select count(*) from public.research_domain_launch_controls) as launch_controls,
  (select count(*) from public.care_capabilities
    where capability_key = 'care' and enabled = false) as care_disabled_rows;
