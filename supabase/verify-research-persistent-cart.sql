\set ON_ERROR_STOP on

do $verify$
declare
  v_tables text[] := array[
    'research_persistent_carts','research_persistent_cart_items',
    'research_persistent_cart_commands','research_persistent_cart_events'
  ];
  v_commands text[] := array[
    'research_persistent_cart_get','research_persistent_cart_put_item',
    'research_persistent_cart_remove_item','research_persistent_cart_claim',
    'research_persistent_cart_expire'
  ];
  v_count integer;
begin
  select count(*) into v_count from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname=any(v_tables) and c.relkind='r'
     and c.relrowsecurity and c.relforcerowsecurity;
  if v_count<>4 then raise exception 'persistent cart forced-RLS mismatch: %',v_count; end if;

  select count(*) into v_count from pg_policies
   where schemaname='public' and tablename=any(v_tables);
  if v_count<>0 then raise exception 'persistent cart policies found: %',v_count; end if;

  select count(*) into v_count from information_schema.role_table_grants
   where table_schema='public' and table_name=any(v_tables)
     and grantee in ('PUBLIC','anon','authenticated');
  if v_count<>0 then raise exception 'persistent cart browser grants found: %',v_count; end if;

  select count(*) into v_count from information_schema.role_table_grants
   where table_schema='public' and table_name=any(v_tables)
     and grantee='service_role' and privilege_type='SELECT';
  if v_count<>4 then raise exception 'persistent cart service SELECT mismatch: %',v_count; end if;

  select count(*) into v_count from information_schema.role_table_grants
   where table_schema='public' and table_name=any(v_tables)
     and grantee='service_role' and privilege_type<>'SELECT';
  if v_count<>0 then raise exception 'persistent cart direct service mutation grant found'; end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname=any(v_commands) and p.prosecdef
     and coalesce(p.proconfig,array[]::text[]) @> array['search_path=pg_catalog'];
  if v_count<>5 then raise exception 'persistent cart command function mismatch: %',v_count; end if;

  select count(*) into v_count from information_schema.routine_privileges
   where routine_schema='public' and routine_name=any(v_commands)
     and grantee in ('PUBLIC','anon','authenticated');
  if v_count<>0 then raise exception 'persistent cart browser RPC grant found: %',v_count; end if;

  select count(*) into v_count from information_schema.routine_privileges
   where routine_schema='public' and routine_name=any(v_commands)
     and grantee='service_role' and privilege_type='EXECUTE';
  if v_count<>5 then raise exception 'persistent cart service RPC mismatch: %',v_count; end if;

  select count(*) into v_count from information_schema.routine_privileges
   where routine_schema='public'
     and routine_name=any(array[
       'research_persistent_cart_immutable','research_persistent_cart_owner_scope',
       'research_persistent_cart_inventory_source_version',
       'research_persistent_cart_selection_current','research_persistent_cart_json'
     ]) and grantee in ('PUBLIC','anon','authenticated','service_role');
  if v_count<>0 then raise exception 'persistent cart internal function grant found: %',v_count; end if;

  select (select count(*) from public.research_persistent_carts)
    +(select count(*) from public.research_persistent_cart_items)
    +(select count(*) from public.research_persistent_cart_commands)
    +(select count(*) from public.research_persistent_cart_events)
  into v_count;
  if v_count<>0 then raise exception 'persistent cart rows found: %',v_count; end if;
end
$verify$;
