\set ON_ERROR_STOP on

-- Read-only production verification for Product Control Center.
-- This script creates no durable object and performs no domain mutation.

do $verify$
declare
  expected_tables constant text[] := array[
    'research_products',
    'research_product_facts',
    'research_product_goals',
    'research_product_guide_links',
    'research_product_prohibited_claims',
    'research_product_open_questions',
    'research_supplement_candidates',
    'research_product_content',
    'research_product_variants',
    'research_product_prices',
    'research_product_media',
    'research_product_admin_audit'
  ];
  command_tables constant text[] := array[
    'research_products',
    'research_product_variants',
    'research_product_prices',
    'research_product_media',
    'research_product_admin_audit'
  ];
  command_functions constant text[] := array[
    'research_admin_create_product',
    'research_admin_update_product',
    'research_admin_duplicate_product',
    'research_admin_transition_product',
    'research_admin_create_product_variant',
    'research_admin_update_product_variant',
    'research_admin_create_product_price',
    'research_admin_approve_product_price',
    'research_admin_prepare_product_media',
    'research_admin_confirm_product_media',
    'research_admin_update_product_media'
  ];
  actual integer;
begin
  select count(*) into actual
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(expected_tables)
    and c.relkind = 'r';
  if actual <> 12 then
    raise exception 'Product Control table count mismatch: %', actual;
  end if;

  select count(*) into actual
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(expected_tables)
    and c.relrowsecurity
    and c.relforcerowsecurity;
  if actual <> 12 then
    raise exception 'Product Control forced-RLS count mismatch: %', actual;
  end if;

  select count(*) into actual
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any(expected_tables)
    and grantee in ('PUBLIC', 'anon', 'authenticated');
  if actual <> 0 then
    raise exception 'Product Control browser table grants found: %', actual;
  end if;

  select count(*) into actual
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any(expected_tables)
    and grantee = 'service_role';
  if actual <> 33 then
    raise exception 'Product Control service table privilege mismatch: %', actual;
  end if;

  select count(*) into actual
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any(command_tables)
    and grantee = 'service_role'
    and privilege_type = 'SELECT';
  if actual <> 5 then
    raise exception 'Product Control command-table SELECT mismatch: %', actual;
  end if;

  select count(*) into actual
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any(command_tables)
    and grantee = 'service_role'
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if actual <> 0 then
    raise exception 'Product Control command-table DML grant found: %', actual;
  end if;

  select count(*) into actual
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name = any(command_functions)
    and grantee = 'service_role'
    and privilege_type = 'EXECUTE';
  if actual <> 11 then
    raise exception 'Product Control service RPC grant mismatch: %', actual;
  end if;

  select count(*) into actual
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name = any(command_functions)
    and grantee in ('PUBLIC', 'anon', 'authenticated');
  if actual <> 0 then
    raise exception 'Product Control browser/public RPC grants found: %', actual;
  end if;

  select count(*) into actual
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any(command_functions)
    and p.prosecdef
    and coalesce(p.proconfig, array[]::text[]) @> array['search_path=pg_catalog'];
  if actual <> 11 then
    raise exception 'Product Control fixed-search-path RPC mismatch: %', actual;
  end if;

  select count(*) into actual
  from storage.buckets
  where id = 'research-product-media-production'
    and name = 'research-product-media-production'
    and public = false
    and file_size_limit = 10485760
    and cardinality(allowed_mime_types) = 3
    and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]
    and allowed_mime_types <@ array['image/jpeg','image/png','image/webp']::text[];
  if actual <> 1 then
    raise exception 'Product Control private media bucket mismatch: %', actual;
  end if;
end
$verify$;

select table_name, row_count
from (
  select 'research_products'::text as table_name, count(*)::bigint as row_count from public.research_products
  union all select 'research_product_facts', count(*) from public.research_product_facts
  union all select 'research_product_goals', count(*) from public.research_product_goals
  union all select 'research_product_guide_links', count(*) from public.research_product_guide_links
  union all select 'research_product_prohibited_claims', count(*) from public.research_product_prohibited_claims
  union all select 'research_product_open_questions', count(*) from public.research_product_open_questions
  union all select 'research_supplement_candidates', count(*) from public.research_supplement_candidates
  union all select 'research_product_content', count(*) from public.research_product_content
  union all select 'research_product_variants', count(*) from public.research_product_variants
  union all select 'research_product_prices', count(*) from public.research_product_prices
  union all select 'research_product_media', count(*) from public.research_product_media
  union all select 'research_product_admin_audit', count(*) from public.research_product_admin_audit
) counts
order by table_name;

select
  (select count(*) from public.research_members) as members,
  (select count(*) from public.research_membership_applications) as applications,
  (select count(*) from public.research_notification_outbox) as outbox,
  (select count(*) from public.research_required_inputs) as required_inputs,
  (select count(*) from public.research_domain_launch_controls) as launch_controls,
  (select count(*) from public.care_capabilities where capability_key = 'care' and enabled = false) as care_disabled_rows;
