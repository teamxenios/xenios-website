-- READ ONLY. Immediate post-install check BEFORE the durable checkout composition
-- is enabled. No writes, no function calls that mutate, no customer rows.
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
set local row_security = off;

do $postcheck$
declare
  object_name text;
  row_total bigint;
  privilege_name text;
begin
  foreach object_name in array array['public.research_checkout_executions','public.research_payment_webhook_inbox'] loop
    if to_regclass(object_name) is null then
      raise exception 'missing table %', object_name;
    end if;
    if not exists (select 1 from pg_class where oid = to_regclass(object_name) and relrowsecurity and relforcerowsecurity) then
      raise exception '% must have RLS enabled and forced', object_name;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = split_part(object_name, '.', 2)) then
      raise exception '% must carry no policies (service-role only)', object_name;
    end if;
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon', object_name, privilege_name)
        or has_table_privilege('authenticated', object_name, privilege_name) then
        raise exception '% grants % to a public role', object_name, privilege_name;
      end if;
    end loop;
    if has_table_privilege('service_role', object_name, 'DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception '% has unsafe service-role privilege', object_name;
    end if;
    if object_name = 'public.research_payment_webhook_inbox' and (
      not has_table_privilege('service_role', object_name, 'SELECT')
      or has_table_privilege('service_role', object_name, 'INSERT,UPDATE')) then
      raise exception '% must be service-role read-only with RPC-only writes', object_name;
    end if;
    if object_name = 'public.research_checkout_executions' and (
      not has_table_privilege('service_role', object_name, 'SELECT')
      or not has_table_privilege('service_role', object_name, 'INSERT')
      or not has_table_privilege('service_role', object_name, 'UPDATE')) then
      raise exception '% lacks required service-role execution privileges', object_name;
    end if;
    execute format('select count(*) from %s', object_name) into row_total;
    if row_total <> 0 then
      raise exception 'first-install postcheck expects zero rows in %, found %', object_name, row_total;
    end if;
  end loop;
  foreach object_name in array array[
    'public.research_checkout_execution_claim(uuid,integer,text)',
    'public.research_checkout_execution_record_provider(uuid,integer,jsonb)',
    'public.research_checkout_execution_commit_captured(uuid,integer,timestamptz)',
    'public.research_checkout_execution_commit_cancelled(uuid,integer,timestamptz)',
    'public.research_payment_webhook_inbox_claim(text,text,text,text,timestamptz)',
    'public.research_payment_webhook_inbox_terminalize(text,text,text,text,text,text,uuid,uuid)'] loop
    if to_regprocedure(object_name) is null then
      raise exception 'missing function %', object_name;
    end if;
    if has_function_privilege('anon', object_name, 'EXECUTE')
      or has_function_privilege('authenticated', object_name, 'EXECUTE') then
      raise exception '% is executable by a public role', object_name;
    end if;
    if not has_function_privilege('service_role', object_name, 'EXECUTE') then
      raise exception '% is not executable by service_role', object_name;
    end if;
    if object_name like '%webhook_inbox_%' and (
      not (select prosecdef from pg_proc where oid=object_name::regprocedure)
      or not exists (select 1 from pg_proc p, unnest(p.proconfig) c
        where p.oid=object_name::regprocedure and c='search_path=""')) then
      raise exception '% lacks the exact SECURITY DEFINER/search_path posture', object_name;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgrelid='public.research_checkout_executions'::regclass
      and tgname='research_checkout_executions_immutable'
      and tgfoid='public.research_checkout_executions_immutable()'::regprocedure and not tgisinternal and tgenabled='O')
     or not exists (select 1 from pg_trigger where tgrelid='public.research_payment_webhook_inbox'::regclass
      and tgname='research_payment_webhook_inbox_immutable'
      and tgfoid='public.research_payment_webhook_inbox_immutable()'::regprocedure and not tgisinternal and tgenabled='O') then
    raise exception 'immutability trigger missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.research_payment_webhook_inbox'::regclass
      and conname='research_payment_webhook_inbox_lifecycle' and contype='c')
     or not exists (select 1 from pg_constraint where conrelid='public.research_payment_webhook_inbox'::regclass
      and conname='research_payment_webhook_inbox_one_binding' and contype='c') then
    raise exception 'webhook inbox lifecycle constraints missing';
  end if;
  foreach object_name in array array['authorization_first_attempted_at','local_commit_failure','price_version','reservation_ids','request_body_sha256','settled_at'] loop
    if not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'research_checkout_executions' and column_name = object_name) then
      raise exception 'research_checkout_executions lacks column %', object_name;
    end if;
  end loop;
  if not exists (select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'research_checkout_executions_provider_reference_idx') then
    raise exception 'provider reference unique index missing';
  end if;
  raise notice 'checkout executions postcheck PASS';
end $postcheck$;
rollback;
