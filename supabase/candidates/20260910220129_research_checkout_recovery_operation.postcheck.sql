-- Read-only schema/permission checks. Does not claim a lease or create fixtures.
do $$
declare v_fn oid := to_regprocedure('public.research_checkout_recovery_operation(text,uuid,bigint,jsonb)');
begin
  if v_fn is null or not exists (select 1 from pg_proc where oid = v_fn
      and not prosecdef and provolatile = 'v' and prorettype = 'jsonb'::regtype
      and proargnames = array['p_action','p_owner','p_fence','p_data']
      and proconfig @> array['search_path=""','TimeZone=UTC','DateStyle=ISO, YMD']) then
    raise exception 'recovery_operation_signature_invalid';
  end if;
  if has_function_privilege('anon',v_fn,'EXECUTE') or has_function_privilege('authenticated',v_fn,'EXECUTE')
      or not has_function_privilege('service_role',v_fn,'EXECUTE') then
    raise exception 'recovery_operation_function_permissions_invalid';
  end if;
  if not has_table_privilege('service_role','public.research_idempotency_keys','SELECT')
      or not has_table_privilege('service_role','public.research_idempotency_keys','INSERT')
      or not has_table_privilege('service_role','public.research_idempotency_keys','UPDATE')
      or not has_table_privilege('service_role','public.research_checkout_executions','SELECT')
      or not has_function_privilege('service_role',
        'public.research_checkout_executions_list_recoverable(timestamp with time zone,integer,timestamp with time zone,uuid)','EXECUTE') then
    raise exception 'recovery_operation_invoker_permissions_missing';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.research_idempotency_keys'::regclass and relrowsecurity)
      or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'research_idempotency_keys') then
    raise exception 'recovery_idempotency_visibility_changed';
  end if;
end;
$$;
