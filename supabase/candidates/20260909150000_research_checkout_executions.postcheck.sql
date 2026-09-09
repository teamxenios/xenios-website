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
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      if has_table_privilege('anon', object_name, privilege_name)
        or has_table_privilege('authenticated', object_name, privilege_name) then
        raise exception '% grants % to a public role', object_name, privilege_name;
      end if;
    end loop;
    if has_table_privilege('service_role', object_name, 'DELETE') then
      raise exception '% must not be deletable through service_role', object_name;
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
    'public.research_checkout_execution_commit_cancelled(uuid,integer,timestamptz)'] loop
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
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'research_checkout_executions_immutable' and not tgisinternal) then
    raise exception 'immutability trigger missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'research_checkout_executions_provider_reference_idx') then
    raise exception 'provider reference unique index missing';
  end if;
  raise notice 'checkout executions postcheck PASS';
end $postcheck$;
rollback;
