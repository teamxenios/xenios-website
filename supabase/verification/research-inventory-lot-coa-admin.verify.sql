\set ON_ERROR_STOP on

-- Schema/security assertions after the migration has been applied twice.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'research_inventory_lots',
    'research_lot_quality_documents',
    'research_lot_allocations',
    'research_inventory_movements',
    'research_inventory_lot_events',
    'research_lot_quality_tests',
    'research_lot_quality_events'
  ] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = table_name
         and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception 'RLS is not forced on %', table_name;
    end if;
    if has_table_privilege('anon', 'public.' || table_name, 'select')
       or has_table_privilege('authenticated', 'public.' || table_name, 'insert') then
      raise exception 'browser grant remains on %', table_name;
    end if;
  end loop;
  if has_table_privilege('service_role', 'public.research_inventory_lots', 'update') then
    raise exception 'service_role must not directly update lot counts';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.research_apply_inventory_movement(uuid,text,integer,text,bigint,text,text,text,timestamptz)',
    'execute'
  ) then
    raise exception 'service_role movement RPC grant missing';
  end if;
end;
$$;

begin;

insert into public.research_products(id, sku)
values ('00000000-0000-4000-8000-000000000101', 'WAVE2-SKU');

insert into public.research_inventory_lots(
  id, lot_id, sku, owner, disposition, product_id, variant_id,
  storage_location, supplier_reference, expiry_date, shelf_life_source,
  creation_idempotency_key, creation_command_hash
) values (
  '00000000-0000-4000-8000-000000000201', 'WAVE2-LOT-001', 'WAVE2-SKU', 'xenios', 'quarantined',
  '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102',
  'A-01', 'SUPPLIER-REF-001', current_date + 365, 'supplier_document',
  'create-lot-wave2-001', repeat('a', 64)
);

-- A direct count overwrite must fail even for the database owner.
do $$
declare blocked boolean := false;
begin
  begin
    update public.research_inventory_lots
       set quantity_available = 999
     where id = '00000000-0000-4000-8000-000000000201';
  exception when others then
    blocked := sqlerrm like '%atomic movement command%';
  end;
  if not blocked then raise exception 'direct inventory count overwrite was not blocked'; end if;
end;
$$;

select public.research_apply_inventory_movement(
  '00000000-0000-4000-8000-000000000201', 'receipt', 100, null, 1,
  'movement-receipt-001', 'Verified disposable receipt', 'operator-1', now()
);

-- Same key and command replays without a second movement or quantity change.
do $$
declare replay jsonb;
begin
  replay := public.research_apply_inventory_movement(
    '00000000-0000-4000-8000-000000000201', 'receipt', 100, null, 1,
    'movement-receipt-001', 'Verified disposable receipt', 'operator-1', now()
  );
  if replay->>'idempotentReplay' <> 'true' then raise exception 'idempotent replay not reported'; end if;
  if (select count(*) from public.research_inventory_movements) <> 1 then
    raise exception 'idempotent replay appended a duplicate movement';
  end if;
end;
$$;

-- Reusing a key for a different command must fail.
do $$
declare blocked boolean := false;
begin
  begin
    perform public.research_apply_inventory_movement(
      '00000000-0000-4000-8000-000000000201', 'receipt', 101, null, 1,
      'movement-receipt-001', 'Verified disposable receipt', 'operator-1', now()
    );
  exception when others then blocked := sqlerrm like '%different inventory command%'; end;
  if not blocked then raise exception 'idempotency-key conflict was not blocked'; end if;
end;
$$;

insert into public.research_lot_quality_documents(
  id, lot_id, coa_on_file, document_ref, document_state, verification_state,
  private_storage_key, bucket_id, original_filename, content_type, size_bytes, sha256,
  report_issuer, report_number, report_date, version
) values (
  '00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', false,
  'lots/00000000-0000-4000-8000-000000000201/coa.pdf', 'pending', 'pending',
  'lots/00000000-0000-4000-8000-000000000201/coa.pdf', 'research-coa-production',
  'coa.pdf', 'application/pdf', 100, repeat('b', 64),
  'Verified Lab', 'REPORT-001', current_date, 1
);

do $$
declare blocked boolean := false;
begin
  begin update public.research_lot_quality_documents set coa_on_file = true where id = '00000000-0000-4000-8000-000000000301';
  exception when others then blocked := sqlerrm like '%reviewed quality command%'; end;
  if not blocked then raise exception 'direct COA approval-state update was not blocked'; end if;
end;
$$;

select public.research_manage_lot_quality_document(
  '00000000-0000-4000-8000-000000000301', 'confirm_upload', '[]'::jsonb, 1,
  'quality-confirm-001', 'Private exact-lot object verified', 'reviewer-1', now()
);

-- Missing tests must never approve.
do $$
declare blocked boolean := false;
begin
  begin
    perform public.research_manage_lot_quality_document(
      '00000000-0000-4000-8000-000000000301', 'approve', '[]'::jsonb, 2,
      'quality-approve-missing', 'Review attempted without tests', 'reviewer-1', now()
    );
  exception when others then blocked := sqlerrm like '%tests are not approved%'; end;
  if not blocked then raise exception 'missing tests were treated as passing'; end if;
end;
$$;

select public.research_manage_lot_quality_document(
  '00000000-0000-4000-8000-000000000301', 'approve',
  '[
    {"testKey":"identity","state":"passed","method":"MS","result":"match","unit":null},
    {"testKey":"assay","state":"passed","method":"HPLC","result":"within specification","unit":"percent"},
    {"testKey":"purity","state":"passed","method":"HPLC","result":"within specification","unit":"percent"},
    {"testKey":"chain_of_custody","state":"passed","method":"document review","result":"verified","unit":null}
  ]'::jsonb,
  2, 'quality-approve-001', 'Exact product variant lot and report reviewed', 'reviewer-1', now()
);

select public.research_manage_lot_quality_document(
  '00000000-0000-4000-8000-000000000301', 'publish', '[]'::jsonb, 3,
  'quality-publish-001', 'Approved exact-lot COA published', 'reviewer-1', now()
);

select public.research_set_inventory_lot_disposition(
  '00000000-0000-4000-8000-000000000201', 'available', 2,
  'lot-release-001', 'Exact-lot quality gate passed', 'operator-1', now()
);

select public.research_apply_inventory_movement('00000000-0000-4000-8000-000000000201','reserve',10,null,3,'movement-reserve-001','Reserve verified stock','operator-1',now());
select public.research_apply_inventory_movement('00000000-0000-4000-8000-000000000201','release',5,null,4,'movement-release-001','Release unused reservation','operator-1',now());
select public.research_apply_inventory_movement('00000000-0000-4000-8000-000000000201','adjust',-2,'available',5,'movement-adjust-001','Documented count adjustment','operator-1',now());
select public.research_apply_inventory_movement('00000000-0000-4000-8000-000000000201','quarantine',10,null,6,'movement-quarantine-001','Controlled quality hold','operator-1',now());
select public.research_apply_inventory_movement('00000000-0000-4000-8000-000000000201','quarantine_release',5,null,7,'movement-qrelease-001','Reviewed quarantine release','operator-1',now());
select public.research_apply_inventory_movement('00000000-0000-4000-8000-000000000201','damage',3,'available',8,'movement-damage-001','Verified damaged units','operator-1',now());
select public.research_apply_inventory_movement('00000000-0000-4000-8000-000000000201','reconcile',2,'available',9,'movement-reconcile-001','Physical reconciliation delta','operator-1',now());

-- Movement history is immutable.
do $$
declare blocked boolean := false;
begin
  begin update public.research_inventory_movements set reason = 'rewrite' where idempotency_key = 'movement-receipt-001';
  exception when others then blocked := sqlerrm like '%append-only%'; end;
  if not blocked then raise exception 'movement history update was not blocked'; end if;
end;
$$;

-- Quarantine state blocks reservation even with approved documentation.
select public.research_set_inventory_lot_disposition(
  '00000000-0000-4000-8000-000000000201', 'quarantined', 10,
  'lot-quarantine-001', 'Controlled disposition test', 'operator-1', now()
);
do $$
declare blocked boolean := false;
begin
  begin
    perform public.research_apply_inventory_movement(
      '00000000-0000-4000-8000-000000000201','reserve',1,null,11,
      'movement-blocked-001','Must be blocked','operator-1',now()
    );
  exception when others then blocked := sqlerrm like '%not allocatable%'; end;
  if not blocked then raise exception 'quarantined lot was allocatable'; end if;
end;
$$;

select public.research_set_inventory_lot_disposition(
  '00000000-0000-4000-8000-000000000201', 'available', 11,
  'lot-rerelease-001', 'Restore approved disposition', 'operator-1', now()
);

update public.research_inventory_lots set expiry_date = current_date - 1
 where id = '00000000-0000-4000-8000-000000000201';
do $$ begin
  if public.research_lot_is_allocatable('00000000-0000-4000-8000-000000000201', now()) then
    raise exception 'expired lot was allocatable';
  end if;
end $$;
update public.research_inventory_lots set expiry_date = current_date + 365, recalled = true, recalled_at = now()
 where id = '00000000-0000-4000-8000-000000000201';
do $$ begin
  if public.research_lot_is_allocatable('00000000-0000-4000-8000-000000000201', now()) then
    raise exception 'recalled lot was allocatable';
  end if;
end $$;

-- Exact arithmetic after every movement: received 100; available 87; reserved 5;
-- quarantined 5; damaged 3. No hidden overwrite or double decrement.
do $$
declare l public.research_inventory_lots%rowtype;
begin
  select * into l from public.research_inventory_lots where id = '00000000-0000-4000-8000-000000000201';
  if (l.quantity_received, l.quantity_available, l.quantity_reserved, l.quantity_quarantined, l.quantity_damaged)
     <> (100, 87, 5, 5, 3) then
    raise exception 'exact quantity invariant mismatch: %, %, %, %, %', l.quantity_received, l.quantity_available, l.quantity_reserved, l.quantity_quarantined, l.quantity_damaged;
  end if;
  if (select count(*) from public.research_inventory_movements) <> 8 then
    raise exception 'unexpected movement history count';
  end if;
end;
$$;

rollback;

-- Disposable behavior proof leaves zero residual business rows.
do $$
begin
  if (select count(*) from public.research_products) <> 0
     or (select count(*) from public.research_inventory_lots) <> 0
     or (select count(*) from public.research_lot_quality_documents) <> 0
     or (select count(*) from public.research_inventory_movements) <> 0
     or (select count(*) from public.research_lot_quality_tests) <> 0 then
    raise exception 'disposable verification left residual rows';
  end if;
end;
$$;

select 'WAVE2_DISPOSABLE_VERIFICATION_OK' as result;
