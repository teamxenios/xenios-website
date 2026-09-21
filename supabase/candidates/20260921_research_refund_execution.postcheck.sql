-- Catalog-only postcheck; no customer data is selected.
do $$
declare
  v_functions text[] := array[
    'research_refund_execution_prepare','research_refund_execution_claim',
    'research_refund_execution_record_provider','research_refund_execution_require_reconciliation',
    'research_refund_execution_commit'
  ];
  v_proc oid;
begin
  if to_regclass('public.research_refund_executions') is null then raise exception 'refund execution table missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='research_payment_webhook_inbox' and column_name='refund_execution_id' and udt_name='uuid')
     or not exists (select 1 from pg_constraint where conrelid='public.research_payment_webhook_inbox'::regclass and contype='f'
       and pg_get_constraintdef(oid) like '%refund_execution_id%' and pg_get_constraintdef(oid) like '%research_refund_executions%') then
    raise exception 'refund webhook inbox binding missing';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.research_refund_executions'::regclass) then
    raise exception 'refund execution RLS is not enabled and forced';
  end if;
  if has_table_privilege('anon','public.research_refund_executions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('authenticated','public.research_refund_executions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('service_role','public.research_refund_executions','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'refund execution table grants are wider than read-only service role';
  end if;
  if not has_table_privilege('service_role','public.research_refund_executions','SELECT') then
    raise exception 'service role refund execution read missing';
  end if;
  if exists (select 1 from pg_class c where c.oid='public.research_refund_executions'::regclass and c.relowner in
       ((select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'),(select oid from pg_roles where rolname='service_role'))) then
    raise exception 'refund execution table owner posture is unsafe';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=any(v_functions) and p.prosecdef) <> 5 then
    raise exception 'refund execution SECURITY DEFINER RPC set incomplete';
  end if;
  for v_proc in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.proname=any(v_functions)
  loop
    if has_function_privilege('anon',v_proc,'EXECUTE') or has_function_privilege('authenticated',v_proc,'EXECUTE')
       or not has_function_privilege('service_role',v_proc,'EXECUTE')
       or exists (select 1 from aclexplode(coalesce((select proacl from pg_proc where oid=v_proc),
                    acldefault('f',(select proowner from pg_proc where oid=v_proc)))) where grantee=0 and privilege_type='EXECUTE') then
      raise exception 'refund execution RPC privilege posture is unsafe: %', v_proc::regprocedure;
    end if;
    if not exists (select 1 from pg_proc p, unnest(p.proconfig) c where p.oid=v_proc and c like 'search_path=%pg_catalog%public%')
       or exists (select 1 from pg_proc p where p.oid=v_proc and p.proowner in
          ((select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'),(select oid from pg_roles where rolname='service_role'))) then
      raise exception 'refund execution RPC owner/search_path posture is unsafe: %', v_proc::regprocedure;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgrelid='public.research_claims'::regclass and tgname='research_refund_active_claim_guard' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid='public.research_orders'::regclass and tgname='research_refund_active_order_guard' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid='public.research_refund_executions'::regclass and tgname='research_refund_execution_immutable' and not tgisinternal) then
    raise exception 'active refund mutation guards missing';
  end if;
  if exists (select 1 from pg_trigger where tgname in ('research_refund_active_claim_guard','research_refund_active_order_guard','research_refund_execution_immutable') and tgenabled <> 'O') then
    raise exception 'refund execution trigger is not enabled normally';
  end if;
end $$;
