-- Pack 04 read-only postcheck.
-- DRAFT, NOT RUN. Run only after the reviewed draft has been applied to a
-- disposable managed-Supabase-shaped database. This script writes no rows and
-- rolls back its read-only transaction.

begin transaction read only;

do $pack04_postcheck$
declare
  v_table text;
  v_rls_count integer;
  v_definition text;
begin
  foreach v_table in array array[
    'research_order_business_organizations',
    'research_order_organization_buyers',
    'research_order_workflows',
    'research_order_invoices',
    'research_order_payment_evidence',
    'research_order_payment_verifications',
    'research_order_supplier_handoffs',
    'research_order_supplier_releases',
    'research_order_fulfillment_events',
    'research_order_tracking_events',
    'research_order_command_receipts',
    'research_order_timeline_events',
    'research_order_audit_events'
  ] loop
    if pg_catalog.to_regclass('public.' || v_table) is null then
      raise exception 'Pack 04 postcheck: public.% is absent', v_table using errcode = '55000';
    end if;
  end loop;

  select pg_catalog.count(*) into v_rls_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(array[
      'research_order_business_organizations',
      'research_order_organization_buyers',
      'research_order_workflows',
      'research_order_invoices',
      'research_order_payment_evidence',
      'research_order_payment_verifications',
      'research_order_supplier_handoffs',
      'research_order_supplier_releases',
      'research_order_fulfillment_events',
      'research_order_tracking_events',
      'research_order_command_receipts',
      'research_order_timeline_events',
      'research_order_audit_events'
    ])
    and c.relrowsecurity
    and c.relforcerowsecurity;
  if v_rls_count <> 13 then
    raise exception 'Pack 04 postcheck: expected forced RLS on 13 tables, found %', v_rls_count
      using errcode = '55000';
  end if;

  if pg_catalog.to_regprocedure(
    'public.research_order_pack04_valid_line_quantities(jsonb)'
  ) is null or pg_catalog.to_regprocedure(
    'public.research_customer_order_timeline(text)'
  ) is null or pg_catalog.to_regprocedure(
    'public.research_customer_order_history(integer,timestamp with time zone,text)'
  ) is null then
    raise exception 'Pack 04 postcheck: required quantity or customer projection function is absent'
      using errcode = '55000';
  end if;

  if not public.research_order_pack04_valid_line_quantities('[{"sku":"SKU-1","quantity":1}]')
     or not public.research_order_pack04_valid_line_quantities('[{"sku":"SKU-20","quantity":20}]')
     or not public.research_order_pack04_valid_line_quantities('[{"sku":"SKU-21","quantity":21}]')
     or not public.research_order_pack04_valid_line_quantities('[{"sku":"SKU-49","quantity":49}]')
     or not public.research_order_pack04_valid_line_quantities('[{"sku":"SKU-50","quantity":50}]')
     or public.research_order_pack04_valid_line_quantities('[{"sku":"SKU-0","quantity":0}]')
     or public.research_order_pack04_valid_line_quantities('[{"sku":"SKU-51","quantity":51}]')
     or public.research_order_pack04_valid_line_quantities('[{"sku":"SKU-X","quantity":1.5}]')
     or public.research_order_pack04_valid_line_quantities(
       '[{"sku":"SKU-DUP","quantity":1},{"sku":"SKU-DUP","quantity":2}]'
     ) then
    raise exception 'Pack 04 postcheck: founder quantity band or unique-SKU behavior disagrees'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class rel on rel.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'research_order_workflows'
      and con.conname = 'research_order_workflow_quantity_band'
      and con.convalidated
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class rel on rel.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'research_order_invoices'
      and con.conname = 'research_order_invoice_quantity_band'
      and con.convalidated
  ) then
    raise exception 'Pack 04 postcheck: validated request/invoice quantity constraints are absent'
      using errcode = '55000';
  end if;

  select pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
    'public.research_customer_order_history(integer,timestamp with time zone,text)'
  )) into v_definition;
  if v_definition not like '%auth.uid()%'
     or v_definition not like '%p_limit not between 1 and 100%'
     or v_definition not like '%w.buyer_member_id = v_member_id%'
     or v_definition like '%external_transaction_ref%'
     or v_definition like '%private_object_ref%'
     or v_definition like '%supplier_id%' then
    raise exception 'Pack 04 postcheck: customer history ownership or safe projection disagrees'
      using errcode = '55000';
  end if;

  raise notice 'Pack 04 read-only postcheck PASS';
end
$pack04_postcheck$;

rollback;
