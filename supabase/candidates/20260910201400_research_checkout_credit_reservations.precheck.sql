-- READ ONLY; exact project/executor/source authorization is an external gate.
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
set local row_security = off;
do $precheck$
declare v_table text; v_column text; v_spec record;
begin
  if not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'credit_checker_requires_bypassrls';
  end if;
  if not exists(select 1 from pg_catalog.pg_roles where rolname='service_role' and rolbypassrls) then
    raise exception 'credit_service_role_requires_bypassrls';
  end if;
  for v_spec in select * from (values
    ('research_store_credit_ledger',array['id','member_id','amount_cents','state','reason','available_at','reverses_id','actor_type','actor_id','created_at','expires_at']),
    ('research_checkout_executions',array['id','member_id','order_id','phase','version','settled_at','committed_at','provider_reference','amount_cents','reservation_ids','last_provider_result']),
    ('research_orders',array['id','member_id','state','total_cents','store_credit_applied_cents']),
    ('research_lot_reservations',array['reservation_id','member_id','status']),
    ('research_order_lines',array['order_id','sku','quantity']),
    ('research_order_state_events',array['order_id','from_state','to_state'])
  ) as required(table_name,columns) loop
    v_table := v_spec.table_name;
    if to_regclass('public.'||v_table) is null then raise exception 'credit_prerequisite_table_missing: %',v_table; end if;
    foreach v_column in array v_spec.columns loop
      if not exists(select 1 from information_schema.columns c where c.table_schema='public'
          and c.table_name=v_table and c.column_name=v_column) then
        raise exception 'credit_prerequisite_column_missing: %.%',v_table,v_column;
      end if;
    end loop;
  end loop;
  if to_regprocedure('public.research_checkout_execution_commit_captured(uuid,integer,timestamptz)') is null
    or to_regprocedure('public.research_checkout_execution_commit_cancelled(uuid,integer,timestamptz)') is null then
    raise exception 'credit_execution_functions_missing';
  end if;
  if to_regclass('public.research_checkout_credit_reservations') is not null
    or exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='research_store_credit_ledger' and column_name='spend_order_id')
    or to_regprocedure('public.research_store_credit_balance(uuid,timestamptz)') is not null then
    raise exception 'credit_candidate_already_or_partially_installed';
  end if;
  if exists(select 1 from public.research_checkout_executions e join public.research_orders o on o.id=e.order_id
      where o.store_credit_applied_cents>0 and e.phase<>'committed'
        and not(e.phase='cancelled' and e.settled_at is not null)) then
    raise exception 'credit_existing_unsettled_execution_requires_reconciliation';
  end if;
  raise notice 'credit reservation precheck PASS';
end $precheck$;
rollback;
