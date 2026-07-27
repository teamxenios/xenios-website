\set ON_ERROR_STOP on

-- Read-only production verification for the Research Commerce atomic
-- inventory reservation boundary. This script creates no object and invokes
-- no mutating command.

do $verify$
declare
  expected_tables constant text[] := array[
    'research_lot_reservations',
    'research_lot_reservation_allocations',
    'research_inventory_reservation_events'
  ];
  reviewed_functions constant text[] := array[
    'research_reserve_inventory',
    'research_release_inventory_reservations',
    'research_finalize_inventory_reservations',
    'research_expire_inventory_reservations'
  ];
  internal_functions constant text[] := array[
    'research_inventory_reservation_event_immutable',
    'research_inventory_readiness_serialization_guard',
    'research_inventory_lot_identity_serialization_guard'
  ];
  reviewed_triggers constant text[] := array[
    'research_inventory_reservation_events_no_update',
    'research_inventory_lot_identity_serialization',
    'research_reservation_quality_document_readiness_lock',
    'research_reservation_quality_document_readiness_validate',
    'research_reservation_quality_test_readiness_lock',
    'research_reservation_quality_test_readiness_validate',
    'research_reservation_product_readiness_lock',
    'research_reservation_product_readiness_validate',
    'research_reservation_variant_readiness_lock',
    'research_reservation_variant_readiness_validate'
  ];
  actual integer;
begin
  select count(*) into actual
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(expected_tables)
    and c.relkind = 'r';
  if actual <> 3 then
    raise exception 'reservation table count mismatch: %', actual;
  end if;

  select count(*) into actual
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(expected_tables)
    and c.relrowsecurity
    and c.relforcerowsecurity;
  if actual <> 3 then
    raise exception 'reservation forced-RLS count mismatch: %', actual;
  end if;

  select count(*) into actual
  from pg_policies
  where schemaname = 'public'
    and tablename = any(expected_tables);
  if actual <> 0 then
    raise exception 'reservation RLS policies found: %', actual;
  end if;

  select count(*) into actual
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any(expected_tables)
    and grantee in ('PUBLIC', 'anon', 'authenticated');
  if actual <> 0 then
    raise exception 'reservation browser table grants found: %', actual;
  end if;

  select count(*) into actual
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any(expected_tables)
    and grantee = 'service_role';
  if actual <> 3 then
    raise exception 'reservation service table privilege mismatch: %', actual;
  end if;

  select count(*) into actual
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any(expected_tables)
    and grantee = 'service_role'
    and privilege_type <> 'SELECT';
  if actual <> 0 then
    raise exception 'reservation direct service table mutation grant found: %',
      actual;
  end if;

  select count(*) into actual
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any(reviewed_functions)
    and p.prosecdef
    and coalesce(p.proconfig, array[]::text[]) @>
      array['search_path=pg_catalog'];
  if actual <> 4 then
    raise exception 'reservation fixed-search-path command mismatch: %', actual;
  end if;

  select count(*) into actual
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name = any(reviewed_functions)
    and grantee = 'service_role'
    and privilege_type = 'EXECUTE';
  if actual <> 4 then
    raise exception 'reservation service RPC grant mismatch: %', actual;
  end if;

  select count(*) into actual
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name = any(reviewed_functions || internal_functions)
    and grantee in ('PUBLIC', 'anon', 'authenticated');
  if actual <> 0 then
    raise exception 'reservation browser/public RPC grants found: %', actual;
  end if;

  select count(*) into actual
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name = any(internal_functions)
    and grantee = 'service_role';
  if actual <> 0 then
    raise exception 'reservation internal function grant found: %', actual;
  end if;

  select count(*) into actual
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any(internal_functions)
    and p.prosecdef
    and coalesce(p.proconfig, array[]::text[]) @>
      array['search_path=pg_catalog'];
  if actual <> 3 then
    raise exception 'reservation internal fixed-path function mismatch: %',
      actual;
  end if;

  select count(*) into actual
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
    and t.tgenabled = 'O'
    and t.tgname = any(reviewed_triggers);
  if actual <> 10 then
    raise exception 'reservation trigger count mismatch: %', actual;
  end if;

  select
    (select count(*) from public.research_lot_reservations)
    + (select count(*) from public.research_lot_reservation_allocations)
    + (select count(*) from public.research_inventory_reservation_events)
  into actual;
  if actual <> 0 then
    raise exception 'reservation rows found before enablement: %', actual;
  end if;
end
$verify$;

select table_name, row_count
from (
  select 'research_lot_reservations'::text as table_name,
    count(*)::bigint as row_count
  from public.research_lot_reservations
  union all
  select 'research_lot_reservation_allocations', count(*)
  from public.research_lot_reservation_allocations
  union all
  select 'research_inventory_reservation_events', count(*)
  from public.research_inventory_reservation_events
) counts
order by table_name;

select
  (select count(*) from public.research_members) as members,
  (select count(*) from public.research_applications) as applications,
  (select count(*) from public.research_notification_outbox) as outbox,
  (select count(*) from public.research_required_inputs) as required_inputs,
  (select count(*) from public.research_domain_launch_controls) as launch_controls,
  (select count(*) from public.care_capabilities
    where capability_key = 'care' and state = 'disabled') as care_disabled_rows;
