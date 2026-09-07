-- READ ONLY. Immediate post-install check BEFORE enabling the Hub or admitting
-- real uploads. No synthetic data writes, function calls that mutate, or raw
-- customer/resource rows. Run with stop-on-error and preserve this receipt.
-- After any real use, the deliberate zero-row assertion will fail; inspect
-- evidence rather than delete data or repeat the first-install migration.
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
-- Refuse filtered counts, including FORCE RLS on a non-bypass table owner.
set local row_security = off;

do $postcheck$
declare
  expected record;
  table_oid oid;
  actual_hash text;
  client_role text;
  privilege_name text;
  function_oid oid;
  row_total bigint;
  policy_row record;
  expression_text text;
  bucket_match text[];
begin
  if not exists(select 1 from pg_catalog.pg_roles
    where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Resource Hub checker requires SUPERUSER or BYPASSRLS executor';
  end if;
  if not exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls)
    or exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls))
    or pg_has_role('anon','service_role','MEMBER')
    or pg_has_role('authenticated','service_role','MEMBER') then
    raise exception 'Resource Hub role separation failed';
  end if;
  -- Fingerprints cover exact column order/type/nullability/default and every
  -- primary/unique/check/foreign-key definition. NOT NULL is checked from
  -- pg_attribute, avoiding PostgreSQL 18's new contype=n catalog difference.
  -- A deparser/version mismatch is a STOP for review, never an automatic repin.
  for expected in select * from (values
    ('research_resource_library','5c062cc5a3a0fcaccdc81df42f8dae79','0bfa395e0ae4018024128f3c13fea9cb'),
    ('research_resource_versions','082b72202bca4c895eb06988eda62173','7513c4a67c8b57695af1682353f612ed'),
    ('research_resource_deliveries','177cb954e88f4d51d8872e89d041b7e1','93c5389a6ad7a0e1eef9f84ceb46eeaf')
  ) as e(table_name,column_hash,constraint_hash) loop
    table_oid := to_regclass('public.'||expected.table_name);
    if table_oid is null or not exists(select 1 from pg_class c where c.oid=table_oid
      and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity
      and pg_get_userbyid(c.relowner) not in ('anon','authenticated','service_role')) then
      raise exception 'Resource Hub table/RLS/owner mismatch: %',expected.table_name;
    end if;
    if exists(select 1 from pg_policy where polrelid=table_oid) then
      raise exception 'unexpected Resource Hub RLS policy: %',expected.table_name;
    end if;
    select md5(string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text
      ||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),''),E'\n' order by a.attnum)) into actual_hash
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=table_oid and a.attnum>0 and not a.attisdropped;
    if actual_hash is distinct from expected.column_hash then
      raise exception 'Resource Hub column definition mismatch: %',expected.table_name;
    end if;
    select md5(string_agg(p.conname||':'||pg_get_constraintdef(p.oid),E'\n' order by p.conname)) into actual_hash
    from pg_constraint p where p.conrelid=table_oid and p.contype in ('p','u','f','c');
    if actual_hash is distinct from expected.constraint_hash
      or exists(select 1 from pg_constraint where conrelid=table_oid and not convalidated) then
      raise exception 'Resource Hub constraint definition mismatch: %',expected.table_name;
    end if;
    foreach client_role in array array['anon','authenticated'] loop
      foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
        if has_table_privilege(client_role,table_oid,privilege_name) then
          raise exception 'client privilege remains: % % %',client_role,privilege_name,expected.table_name;
        end if;
      end loop;
      if has_any_column_privilege(client_role,table_oid,'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'client column privilege remains: % %',client_role,expected.table_name;
      end if;
    end loop;
    if exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      where c.oid=table_oid and a.grantee=0) then
      raise exception 'PUBLIC table grant remains: %',expected.table_name;
    end if;
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('service_role',table_oid,privilege_name) is distinct from
        (privilege_name in ('SELECT','INSERT') or (privilege_name='UPDATE' and expected.table_name<>'research_resource_deliveries')) then
        raise exception 'service table privilege mismatch: % %',privilege_name,expected.table_name;
      end if;
    end loop;
    if exists(select 1 from pg_index where indrelid=table_oid and (not indisvalid or not indisready)) then
      raise exception 'Resource Hub index not valid/ready: %',expected.table_name;
    end if;
    execute format('select count(*) from public.%I',expected.table_name) into row_total;
    if row_total<>0 then raise exception 'unexpected first-install rows in %: %; preserve and inspect',expected.table_name,row_total; end if;
  end loop;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
    ('research_resource_versions_immutable','research_resource_hub_publish','research_resource_hub_withdraw'))<>3 then
    raise exception 'Resource Hub function overload/count mismatch';
  end if;
  for expected in select * from (values
    ('public.research_resource_versions_immutable()','04736b2a150f2f7095ccd5c22bac6f07','trigger',false),
    ('public.research_resource_hub_publish(uuid,uuid,text,timestamptz)','ccd18d9cfa373d290f8bdeb81fce6168','void',true),
    ('public.research_resource_hub_withdraw(uuid,uuid,text,timestamptz,text)','dd6e5a07b97205802e40ce2d3e5d2595','void',true)
  ) as e(signature,body_hash,return_type,service_execute) loop
    function_oid := to_regprocedure(expected.signature);
    if function_oid is null or not exists(select 1 from pg_proc p join pg_language l on l.oid=p.prolang
      where p.oid=function_oid and not p.prosecdef and not p.proisstrict and not p.proretset
      and p.provolatile='v' and l.lanname='plpgsql' and p.proconfig is null
      and p.prorettype=expected.return_type::regtype
      and md5(replace(p.prosrc,E'\r\n',E'\n'))=expected.body_hash) then
      raise exception 'Resource Hub function definition mismatch: %',expected.signature;
    end if;
    if has_function_privilege('anon',function_oid,'EXECUTE')
      or has_function_privilege('authenticated',function_oid,'EXECUTE')
      or has_function_privilege('service_role',function_oid,'EXECUTE') is distinct from expected.service_execute then
      raise exception 'Resource Hub function privilege mismatch: %',expected.signature;
    end if;
  end loop;
  if (select count(*) from pg_trigger where not tgisinternal and tgrelid in
    ('public.research_resource_library'::regclass,'public.research_resource_versions'::regclass,'public.research_resource_deliveries'::regclass))<>1
    or not exists(select 1 from pg_trigger where tgrelid='public.research_resource_versions'::regclass
      and tgname='research_resource_versions_immutable' and tgtype=19 and tgenabled='O'
      and tgfoid='public.research_resource_versions_immutable()'::regprocedure and tgqual is null) then
    raise exception 'Resource Hub immutability trigger mismatch';
  end if;
  if (select count(*) from pg_indexes where schemaname='public' and tablename in
    ('research_resource_library','research_resource_versions','research_resource_deliveries'))<>9 then
    raise exception 'Resource Hub index count mismatch';
  end if;
  for expected in select * from (values
    ('research_resource_versions_resource_idx','research_resource_versions','(resource_id, version_number)'),
    ('research_resource_deliveries_resource_idx','research_resource_deliveries','(resource_id, requested_at DESC)'),
    ('research_resource_deliveries_member_idx','research_resource_deliveries','(member_id, requested_at DESC)')
  ) as e(index_name,table_name,definition) loop
    if not exists(select 1 from pg_indexes where schemaname='public' and indexname=expected.index_name
      and indexdef='CREATE INDEX '||expected.index_name||' ON public.'||expected.table_name||' USING btree '||expected.definition) then
      raise exception 'Resource Hub secondary index mismatch: %',expected.index_name;
    end if;
  end loop;
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'Resource Hub Storage objects absent';
  end if;
  if not exists(select 1 from storage.buckets where id='research-resource-library'
    and name='research-resource-library' and public=false)
    or exists(select 1 from storage.buckets where name='research-resource-library' and id<>'research-resource-library') then
    raise exception 'Resource Hub private bucket mismatch';
  end if;
  if exists(select 1 from storage.objects where bucket_id='research-resource-library') then
    raise exception 'unexpected first-install storage objects; preserve and inspect';
  end if;
  if (select count(*) from pg_class where oid in ('storage.objects'::regclass,'storage.buckets'::regclass)
    and relkind='r' and relrowsecurity)<>2 then raise exception 'Storage RLS mismatch'; end if;
  for policy_row in select * from pg_policies p where schemaname='storage'
    and tablename in ('objects','buckets') and permissive='PERMISSIVE'
    and exists(select 1 from unnest(p.roles) role_name where case when role_name='public' then true
      else pg_has_role('anon',role_name,'USAGE') or pg_has_role('authenticated',role_name,'USAGE') end) loop
    if policy_row.tablename='buckets' then raise exception 'Storage buckets client policy requires review: %',policy_row.policyname; end if;
    foreach expression_text in array array[policy_row.qual,policy_row.with_check] loop
      if expression_text is null then continue; end if;
      bucket_match := regexp_match(expression_text,'^\(bucket_id = ''([^'']+)''::text\)$');
      if bucket_match is null or bucket_match[1]='research-resource-library' then
        raise exception 'Storage objects client policy requires review: %',policy_row.policyname;
      end if;
    end loop;
    if policy_row.qual is null and policy_row.with_check is null then raise exception 'unrestricted Storage client policy: %',policy_row.policyname; end if;
  end loop;
end
$postcheck$;

select clock_timestamp() as observed_at,current_database() as database_name,
  current_user as migration_executor,current_setting('server_version') as server_version,
  r.rolsuper as executor_superuser,r.rolbypassrls as executor_bypassrls,
  current_setting('row_security') as row_security_mode,
  'PASS: exact schema/RPCs, service-only ACLs, private bucket; no seeded rows' as result
from pg_catalog.pg_roles r where r.rolname=current_user;
select 'research_resource_library' as relation,count(*) as rows from public.research_resource_library
union all select 'research_resource_versions',count(*) from public.research_resource_versions
union all select 'research_resource_deliveries',count(*) from public.research_resource_deliveries
union all select 'research-resource-library storage objects',count(*) from storage.objects where bucket_id='research-resource-library';
rollback;
