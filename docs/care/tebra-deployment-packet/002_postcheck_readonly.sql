-- Read-only postcheck for the Care to Tebra link store.
-- Writes nothing. Safe to run against production at any time.
-- Every row must report ok = true.

select 'tables_present' as check_name,
       count(*) = 3 as ok,
       count(*)::text || ' of 3' as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('care_tebra_links','care_tebra_sync_cursors','care_tebra_sync_leases')

union all
select 'rls_enabled',
       bool_and(c.relrowsecurity),
       string_agg(c.relname || '=' || c.relrowsecurity::text, ', ')
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('care_tebra_links','care_tebra_sync_cursors','care_tebra_sync_leases')

union all
-- RLS with no policy denies every non-service role. A policy appearing here
-- would mean someone opened a door this design never intended.
select 'no_policies',
       count(*) = 0,
       coalesce(string_agg(policyname, ', '), 'none')
from pg_policies
where schemaname = 'public'
  and tablename in ('care_tebra_links','care_tebra_sync_cursors','care_tebra_sync_leases')

union all
select 'lease_function_present',
       count(*) = 1,
       count(*)::text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'care_tebra_try_acquire_lease'

union all
select 'external_id_unique',
       count(*) = 1,
       coalesce(string_agg(conname, ', '), 'missing')
from pg_constraint
where conrelid = 'public.care_tebra_links'::regclass
  and conname = 'care_tebra_links_external_id_key'

union all
-- No browser-facing role may reach these tables.
select 'no_public_grants',
       count(*) = 0,
       coalesce(string_agg(grantee || ':' || privilege_type, ', '), 'none')
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('care_tebra_links','care_tebra_sync_cursors','care_tebra_sync_leases')
  and grantee in ('anon','authenticated','public')

union all
-- Every stored mapping must still satisfy the derived-id shape. A row that does
-- not is a routing decision the connector would refuse to trust.
select 'links_wellformed',
       count(*) = 0,
       count(*)::text || ' malformed'
from public.care_tebra_links
where external_id !~ '^xenios:(care_patient|care_appointment):[A-Za-z0-9][A-Za-z0-9._:-]{0,96}$'
   or (entity = 'patient'     and external_id <> 'xenios:care_patient:'     || local_id)
   or (entity = 'appointment' and external_id <> 'xenios:care_appointment:' || local_id);
