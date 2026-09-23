-- Read-only precheck. Run with ON_ERROR_STOP before the candidate.
do $$
begin
  if to_regclass('public.research_orders') is null
     or to_regclass('public.research_claims') is null
     or to_regclass('public.research_refund_keys') is null
     or to_regclass('public.research_order_state_events') is null
     or to_regclass('public.research_payment_webhook_inbox') is null then
    raise exception 'refund execution prerequisite table missing';
  end if;
  if to_regclass('public.research_refund_executions') is not null then
    raise exception 'research_refund_executions already exists; stop for drift review';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='research_orders' and column_name='captured_amount_cents')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='research_orders' and column_name='refunded_cents')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='research_claims' and column_name='reviewed_by') then
    raise exception 'refund execution prerequisite column missing';
  end if;
  if exists (
    select 1
      from (values
        ('research_orders','id','uuid'),('research_orders','state','text'),
        ('research_orders','payment_reference','text'),('research_orders','captured_amount_cents','int8'),
        ('research_orders','refunded_cents','int8'),('research_orders','last_idempotency_key','text'),
        ('research_orders','updated_at','timestamptz'),
        ('research_claims','id','uuid'),('research_claims','order_id','uuid'),
        ('research_claims','state','text'),('research_claims','resolution','text'),
        ('research_claims','reviewed_by','text'),('research_claims','updated_at','timestamptz'),
        ('research_refund_keys','scope','text'),('research_refund_keys','refund_reference','text'),
        ('research_order_state_events','order_id','uuid'),('research_order_state_events','from_state','text'),
        ('research_order_state_events','to_state','text'),('research_order_state_events','actor_type','text'),
        ('research_order_state_events','actor_id','text'),('research_order_state_events','provider_reference','text'),
        ('research_order_state_events','idempotency_key','text'),('research_order_state_events','occurred_at','timestamptz'),
        ('research_payment_webhook_inbox','provider_name','text'),('research_payment_webhook_inbox','event_id','text'),
        ('research_payment_webhook_inbox','execution_id','uuid'),('research_payment_webhook_inbox','refund_execution_id','uuid')
      ) expected(table_name,column_name,udt_name)
     where not exists (
       select 1 from information_schema.columns c
        where c.table_schema='public' and c.table_name=expected.table_name
          and c.column_name=expected.column_name and c.udt_name=expected.udt_name
     )
  ) then
    raise exception 'refund execution prerequisite column type drift';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='research_payment_webhook_inbox' and column_name='refund_execution_id' and udt_name='uuid')
     or exists (select 1 from pg_constraint where conrelid='public.research_payment_webhook_inbox'::regclass and contype='f'
       and pg_get_constraintdef(oid) like '%refund_execution_id%') then
    raise exception 'refund webhook inbox prerequisite drift';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.research_orders'::regclass and contype='c' and pg_get_constraintdef(oid) like '%refunded%')
     or not exists (select 1 from pg_constraint where conrelid='public.research_claims'::regclass and contype='c' and pg_get_constraintdef(oid) like '%approved%' and pg_get_constraintdef(oid) like '%resolved%')
     or not exists (select 1 from pg_constraint where conrelid='public.research_claims'::regclass and contype='c' and pg_get_constraintdef(oid) like '%partial_refund%')
     or not exists (select 1 from pg_constraint where conrelid='public.research_refund_keys'::regclass and contype in ('p','u') and pg_get_constraintdef(oid) like '%scope%')
     or not exists (select 1 from pg_constraint where conrelid='public.research_payment_webhook_inbox'::regclass and contype='p' and pg_get_constraintdef(oid) like '%provider_name%' and pg_get_constraintdef(oid) like '%event_id%') then
    raise exception 'refund execution prerequisite state constraint drift';
  end if;
end $$;
