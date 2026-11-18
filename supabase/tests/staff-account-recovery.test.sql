-- Owned disposable PostgreSQL only. Apply the real Care foundation/current
-- reader + processor role migrations and staff recovery migration first.
-- auth.users must match the provider columns/indexes used below, including
-- idx_users_email and users_email_partial_key WHERE is_sso_user=false.
-- No provider mail is involved. All fixture data and mutations roll back.
begin;
do $$ begin
  if current_database() <> 'staff_recovery_disposable' then
    raise exception 'staff recovery disposable database required';
  end if;
end; $$;

insert into auth.users(id,email,email_confirmed_at,is_sso_user,deleted_at,banned_until)
select ('f1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'staff-fixture-'||n||'@example.invalid', now()-interval '2 days', false, null, null
from generate_series(1,22) as n;

insert into public.care_role_assignments(user_id,role,granted_by,granted_at)
select ('f1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, role,
  'f1000000-0000-4000-8000-000000000001', now()-interval '1 day'
from unnest(array['clinician','clinical_admin','request_intent_reader','request_intent_processor',
  'pharmacy_operations','lab_reviewer','clinical_support','care_security_admin']) with ordinality as roles(role,n);
insert into public.care_role_assignments(user_id,role,granted_by,granted_at)
select ('f1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  case when n in (9,19) then 'care_patient' else 'clinical_support' end,
  'f1000000-0000-4000-8000-000000000001', now()-interval '1 day'
from generate_series(9,22) as n where n<>10;
update public.care_role_assignments set revoked_at=now()-interval '1 hour'
where user_id='f1000000-0000-4000-8000-000000000011';
update public.care_role_assignments set granted_at=now()+interval '1 day'
where user_id='f1000000-0000-4000-8000-000000000012';
update auth.users set email_confirmed_at=null where id='f1000000-0000-4000-8000-000000000013';
update auth.users set deleted_at=now()-interval '1 hour' where id='f1000000-0000-4000-8000-000000000014';
update auth.users set banned_until=now()+interval '1 day' where id='f1000000-0000-4000-8000-000000000015';
update auth.users set is_sso_user=true where id='f1000000-0000-4000-8000-000000000016';
update auth.users set email=upper(email) where id='f1000000-0000-4000-8000-000000000017';
update auth.users set raw_user_meta_data='{"role":"clinical_admin","is_admin":true}'::jsonb
where id='f1000000-0000-4000-8000-000000000019';
update auth.users set banned_until=now()-interval '1 hour' where id='f1000000-0000-4000-8000-000000000021';
update auth.users set email_confirmed_at=now()+interval '1 day' where id='f1000000-0000-4000-8000-000000000022';

create temporary table recovery_before as select
  (select count(*) from auth.users) as users,
  (select md5(string_agg(row_to_json(u)::text,',' order by id)) from auth.users u) as identities,
  (select md5(string_agg(row_to_json(a)::text,',' order by id)) from public.care_role_assignments a) as roles,
  (select count(*) from public.care_access_audit where permission='care:staff_recovery_request') as audits;

-- No authority is exposed to browser roles or granted directly on Auth.
do $$ declare name text; begin
  foreach name in array array['anon','authenticated'] loop
    if has_function_privilege(name,'public.research_staff_recovery_request(text)','execute')
      or has_function_privilege(name,'research_auth_private.staff_recovery_request(text)','execute')
      or has_schema_privilege(name,'research_auth_private','usage') then
      raise exception 'browser role can call staff recovery';
    end if;
  end loop;
  if has_table_privilege('service_role','auth.users','select') then
    raise exception 'service role unexpectedly has direct Auth read authority';
  end if;
  if has_schema_privilege('service_role','research_auth_private','create') then
    raise exception 'service role can create private recovery functions';
  end if;
  begin
    perform public.research_staff_recovery_request('staff-fixture-1@example.invalid');
    raise exception 'owner bypassed explicit backend role guard';
  exception when insufficient_privilege then null; end;
end; $$;
set local role anon;
do $$ begin
  perform public.research_staff_recovery_request('staff-fixture-1@example.invalid');
  raise exception 'anonymous recovery RPC accepted';
exception when insufficient_privilege then null; end; $$;
reset role;
set local role authenticated;
do $$ begin
  perform public.research_staff_recovery_request('staff-fixture-1@example.invalid');
  raise exception 'authenticated recovery RPC accepted';
exception when insufficient_privilege then null; end; $$;
reset role;

set local role service_role;
do $$ declare n integer; expected boolean; begin
  for n in 1..22 loop
    expected := n between 1 and 8 or n in (18,20,21);
    if public.research_staff_recovery_request('staff-fixture-'||n||'@example.invalid') is distinct from expected then
      raise exception 'staff eligibility fixture failed: %',n;
    end if;
  end loop;
  if public.research_staff_recovery_request('unknown-fixture@example.invalid')
    or public.research_staff_recovery_request('STAFF-FIXTURE-1@example.invalid')
    or public.research_staff_recovery_request(' staff-fixture-1@example.invalid')
    or public.research_staff_recovery_request(null) then
    raise exception 'unknown or non-normalized lookup accepted';
  end if;
end; $$;
reset role;

-- A current revocation takes effect on the next request; recovery never
-- renews a role or opens membership, even for a previously eligible subject.
update public.care_role_assignments set revoked_at=now()
where user_id='f1000000-0000-4000-8000-000000000018';
set local role service_role;
do $$ begin
  if public.research_staff_recovery_request('staff-fixture-18@example.invalid') then
    raise exception 'revoked staff designation accepted';
  end if;
end; $$;
reset role;
-- Restore only the test's intentional mutation for role parity below.
update public.care_role_assignments set revoked_at=null
where user_id='f1000000-0000-4000-8000-000000000018';

do $$ declare total integer; allowed integer; begin
  select count(*),count(*) filter(where outcome='allowed') into total,allowed
  from public.care_access_audit where permission='care:staff_recovery_request';
  if total<>(select audits+27 from recovery_before) or allowed<>11 then
    raise exception 'recovery decision audit counts failed';
  end if;
  if exists(select 1 from public.care_access_audit where permission='care:staff_recovery_request'
    and (actor_user_id is not null or occurred_at is null)) then
    raise exception 'unauthenticated requester recorded as target actor';
  end if;
  if (select users from recovery_before)<>(select count(*) from auth.users)
    or (select identities from recovery_before) is distinct from
      (select md5(string_agg(row_to_json(u)::text,',' order by id)) from auth.users u)
    or (select roles from recovery_before) is distinct from
      (select md5(string_agg(row_to_json(a)::text,',' order by id)) from public.care_role_assignments a) then
    raise exception 'recovery mutated Auth identities or staff assignments';
  end if;
  begin
    update public.care_access_audit set outcome='forbidden' where permission='care:staff_recovery_request';
    raise exception 'recovery audit mutation accepted';
  exception when sqlstate '55000' then null; end;
end; $$;

-- Failed audit must abort eligibility, rather than return true to the adapter.
alter table public.care_access_audit add constraint fixture_recovery_audit_failure
  check(permission<>'care:staff_recovery_request') not valid;
set local role service_role;
do $$ begin
  perform public.research_staff_recovery_request('staff-fixture-1@example.invalid');
  raise exception 'eligibility escaped failed audit';
exception when check_violation then null; end; $$;
reset role;
alter table public.care_access_audit drop constraint fixture_recovery_audit_failure;

-- Exercise the actual equality/predicate shape with the provider's existing
-- indexes. This is synthetic planner evidence, not live provider timing.
set local enable_seqscan=off;
do $$ declare plan json; begin
  execute 'explain (format json) select id from auth.users where email=''staff-fixture-1@example.invalid'' and is_sso_user=false' into plan;
  if plan::text !~ 'idx_users_email|users_email_partial_key' then
    raise exception 'exact Auth email lookup did not use the installed email index';
  end if;
end; $$;
rollback;
