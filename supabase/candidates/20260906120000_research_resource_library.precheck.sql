-- READ ONLY, first installation only. Run with stop-on-error as the intended
-- migration executor, against the explicitly approved project. A SQL database
-- name alone cannot prove a Supabase project binding: retain the authenticated
-- connector/project receipt separately. No customer rows or credentials print.
-- Any existing Hub object/bucket is a STOP, including an uncertain prior apply;
-- inspect actual migration history and run the postcheck instead of retrying.
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
-- Refuse filtered visibility; this setting never grants an RLS bypass.
set local row_security = off;

do $precheck$
declare
  object_name text;
  policy_row record;
  expression_text text;
  bucket_match text[];
begin
  if not exists(select 1 from pg_catalog.pg_roles
    where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Resource Hub checker requires SUPERUSER or BYPASSRLS executor';
  end if;
  if current_setting('server_version_num')::integer < 150000
    or to_regprocedure('pg_catalog.gen_random_uuid()') is null then
    raise exception 'Resource Hub requires PostgreSQL 15+ and gen_random_uuid';
  end if;
  foreach object_name in array array['anon','authenticated','service_role'] loop
    if not exists (select 1 from pg_roles where rolname=object_name) then
      raise exception 'required database role absent: %', object_name;
    end if;
  end loop;
  if not exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls)
    or exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls))
    or pg_has_role('anon','service_role','MEMBER')
    or pg_has_role('authenticated','service_role','MEMBER') then
    raise exception 'database service/client role separation is incompatible';
  end if;
  if not has_schema_privilege(current_user,'public','CREATE') then
    raise exception 'migration executor cannot create public schema objects';
  end if;
  foreach object_name in array array[
    'research_resource_library','research_resource_versions','research_resource_deliveries',
    'research_resource_versions_resource_idx','research_resource_deliveries_resource_idx',
    'research_resource_deliveries_member_idx'
  ] loop
    if to_regclass('public.'||object_name) is not null then
      raise exception 'Resource Hub object already exists: %. Stop and reconcile; do not rerun', object_name;
    end if;
  end loop;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
    ('research_resource_versions_immutable','research_resource_hub_publish','research_resource_hub_withdraw')) then
    raise exception 'Resource Hub function name already exists; do not replace unknown source';
  end if;
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'Storage schema absent. Production precheck does not accept a skipped bucket migration';
  end if;
  if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relkind='r' and relrowsecurity)
    or not exists(select 1 from pg_class where oid='storage.buckets'::regclass and relkind='r' and relrowsecurity) then
    raise exception 'Storage tables must have RLS enabled';
  end if;
  if exists(select 1 from storage.buckets where id='research-resource-library' or name='research-resource-library') then
    raise exception 'Resource Hub bucket already exists; preserve and inspect before any mutation';
  end if;
  if not has_table_privilege(current_user,'storage.buckets','SELECT')
    or not has_table_privilege(current_user,'storage.buckets','INSERT')
    or not has_table_privilege(current_user,'storage.buckets','UPDATE') then
    raise exception 'migration executor lacks required Storage bucket privileges';
  end if;
  -- A private bucket can still be accessed through Storage RLS policies. Only
  -- mechanically unambiguous policies limited to a DIFFERENT literal bucket
  -- are accepted here. Complex policies need a separate exact-source review;
  -- do not waive this guard or change unrelated Storage policies to pass it.
  for policy_row in select * from pg_policies p where schemaname='storage'
    and tablename in ('objects','buckets') and permissive='PERMISSIVE'
    and exists(select 1 from unnest(p.roles) role_name where case when role_name='public' then true
      else pg_has_role('anon',role_name,'USAGE') or pg_has_role('authenticated',role_name,'USAGE') end) loop
    if policy_row.tablename='buckets' then
      raise exception 'Storage buckets client policy requires compatibility review: %',policy_row.policyname;
    end if;
    foreach expression_text in array array[policy_row.qual,policy_row.with_check] loop
      if expression_text is null then continue; end if;
      bucket_match := regexp_match(expression_text, '^\(bucket_id = ''([^'']+)''::text\)$');
      if bucket_match is null or bucket_match[1]='research-resource-library' then
        raise exception 'Storage objects client policy requires compatibility review: %',policy_row.policyname;
      end if;
    end loop;
    if policy_row.qual is null and policy_row.with_check is null then
      raise exception 'unrestricted Storage client policy: %',policy_row.policyname;
    end if;
  end loop;
end
$precheck$;

select clock_timestamp() as observed_at, current_database() as database_name,
  current_user as migration_executor, current_setting('server_version') as server_version,
  r.rolsuper as executor_superuser, r.rolbypassrls as executor_bypassrls,
  current_setting('row_security') as row_security_mode,
  'PASS: first-install objects absent; roles and Storage policy compatibility checked' as result
from pg_catalog.pg_roles r where r.rolname=current_user;
-- Default ACLs are evidence only. The candidate explicitly replaces relevant
-- grants and must pass even when these defaults are absent or overbroad.
select n.nspname as schema_name, r.rolname as creator, d.defaclobjtype, d.defaclacl
from pg_default_acl d join pg_roles r on r.oid=d.defaclrole
left join pg_namespace n on n.oid=d.defaclnamespace
where n.nspname='public' or d.defaclnamespace=0;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='storage' and tablename in ('objects','buckets')
order by tablename,policyname;
rollback;
