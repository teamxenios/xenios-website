-- READ ONLY, first installation only. Run with stop-on-error as the intended
-- migration executor against the explicitly approved project (staging first).
-- No customer rows or credentials print. Any existing execution or inbox object
-- is a STOP: inspect migration history and run the postcheck instead.
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
set local row_security = off;

do $precheck$
declare
  object_name text;
begin
  if not exists(select 1 from pg_catalog.pg_roles
    where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception 'checkout executions checker requires SUPERUSER or BYPASSRLS executor';
  end if;
  if current_setting('server_version_num')::integer < 150000
    or to_regprocedure('pg_catalog.gen_random_uuid()') is null then
    raise exception 'checkout executions require PostgreSQL 15+ and gen_random_uuid';
  end if;
  foreach object_name in array array['anon','authenticated','service_role'] loop
    if not exists (select 1 from pg_roles where rolname = object_name) then
      raise exception 'required database role absent: %', object_name;
    end if;
  end loop;
  -- Prerequisite canonical tables and the columns the commit function writes.
  foreach object_name in array array[
    'public.research_orders', 'public.research_order_state_events',
    'public.research_lot_reservations', 'public.research_store_credit_ledger'] loop
    if to_regclass(object_name) is null then
      raise exception 'prerequisite table absent: %', object_name;
    end if;
  end loop;
  foreach object_name in array array['payment_reference','authorized_amount_cents','captured_amount_cents',
    'last_idempotency_key','store_credit_applied_cents','total_cents','placed_at','member_id','state'] loop
    if not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'research_orders' and column_name = object_name) then
      raise exception 'research_orders lacks column %', object_name;
    end if;
  end loop;
  foreach object_name in array array['reservation_id','member_id','status','finalized_at','released_at'] loop
    if not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'research_lot_reservations' and column_name = object_name) then
      raise exception 'research_lot_reservations lacks column %', object_name;
    end if;
  end loop;
  foreach object_name in array array['member_id','amount_cents','state','reason','available_at','reverses_id','actor_type','actor_id','created_at'] loop
    if not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'research_store_credit_ledger' and column_name = object_name) then
      raise exception 'research_store_credit_ledger lacks column %', object_name;
    end if;
  end loop;
  -- The commit function writes reason manual_adjustment and actor_type system; both must be admitted.
  if not exists (select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
    where t.relname = 'research_store_credit_ledger' and pg_get_constraintdef(c.oid) like '%manual_adjustment%') then
    raise exception 'research_store_credit_ledger does not admit reason manual_adjustment';
  end if;
  -- First install: nothing may pre-exist.
  foreach object_name in array array['public.research_checkout_executions','public.research_payment_webhook_inbox'] loop
    if to_regclass(object_name) is not null then
      raise exception 'STOP: % already exists; inspect migration history and run the postcheck', object_name;
    end if;
  end loop;
  foreach object_name in array array[
    'public.research_checkout_execution_claim(uuid,integer,text)',
    'public.research_checkout_execution_record_provider(uuid,integer,jsonb)',
    'public.research_checkout_execution_commit_captured(uuid,integer,timestamptz)',
    'public.research_checkout_execution_commit_cancelled(uuid,integer,timestamptz)'] loop
    if to_regprocedure(object_name) is not null then
      raise exception 'STOP: % already exists', object_name;
    end if;
  end loop;
  raise notice 'checkout executions precheck PASS';
end $precheck$;
rollback;
