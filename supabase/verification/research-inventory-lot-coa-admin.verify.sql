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
    'research_lot_quality_events',
    'research_lot_quality_access_events'
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
  if has_table_privilege('service_role', 'public.research_lot_quality_documents', 'update')
     or has_table_privilege('service_role', 'public.research_lot_quality_documents', 'delete') then
    raise exception 'service_role must not directly rewrite or delete COA metadata';
  end if;
  if has_table_privilege('service_role', 'public.research_lot_quality_access_events', 'insert') then
    raise exception 'service_role must not bypass the private access audit RPC';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.research_apply_inventory_movement(uuid,text,integer,text,bigint,text,text,text,timestamptz)',
    'execute'
  ) then
    raise exception 'service_role movement RPC grant missing';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.research_authorize_lot_quality_access(uuid,text,text,uuid,timestamptz)',
    'execute'
  ) then
    raise exception 'service_role access audit RPC grant missing';
  end if;
end;
$$;

-- The standalone candidate has no product-control implementation. Every product
-- and variant combination must therefore fail closed until Website 2 integrates
-- the exact Website 6-accepted reader.
do $$
begin
  if public.research_inventory_product_variant_ready(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
    'WAVE2-SKU'
  ) then
    raise exception 'standalone product/variant readiness did not fail closed';
  end if;
end;
$$;

-- Real two-session serialization proof. Session A holds each governing row lock,
-- session B starts an identical request, A commits the command, and B must replay
-- the committed event rather than fail a stale-version check.
create extension if not exists dblink;

insert into public.research_products(id, sku)
values ('00000000-0000-4000-8000-000000000101', 'WAVE2-SKU');

insert into public.research_inventory_lots(
  id, lot_id, sku, owner, disposition, product_id, variant_id,
  storage_location, supplier_reference, expiry_date, shelf_life_source,
  creation_idempotency_key, creation_command_hash
) values (
  '00000000-0000-4000-8000-000000000201', 'WAVE2-CONCURRENT-LOT', 'WAVE2-SKU',
  'xenios', 'quarantined',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  'A-01', 'SUPPLIER-REF-CONCURRENT', current_date + 365, 'supplier_document',
  'create-lot-concurrent', repeat('a', 64)
);

insert into public.research_lot_quality_documents(
  id, lot_id, coa_on_file, document_state, verification_state, version
) values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201',
  false, 'pending', 'pending', 1
);

select public.research_manage_lot_quality_document(
  '00000000-0000-4000-8000-000000000301',
  'replace_upload',
  '{
    "bucketId":"research-coa-production",
    "storageKey":"lots/00000000-0000-4000-8000-000000000201/concurrent.pdf",
    "documentRef":"lots/00000000-0000-4000-8000-000000000201/concurrent.pdf",
    "originalFilename":"concurrent.pdf",
    "contentType":"application/pdf",
    "sizeBytes":100,
    "sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "reportIssuer":"Verified Lab",
    "reportNumber":"CONCURRENT-REPORT",
    "reportDate":"2026-07-26"
  }'::jsonb,
  1,
  'quality-reference-concurrent',
  'Concurrent private upload reference',
  'reviewer-1',
  now()
);

select dblink_connect('wave2_a', 'dbname=' || current_database());
select dblink_connect('wave2_b', 'dbname=' || current_database());

select dblink_exec('wave2_a', 'begin');
select * from dblink(
  'wave2_a',
  'select pg_advisory_xact_lock(hashtextextended(''movement-concurrent-001'', 0))::text'
) as locked(result text);
select dblink_send_query(
  'wave2_b',
  'select public.research_apply_inventory_movement(
    ''00000000-0000-4000-8000-000000000201'', ''receipt'', 10, null, 1,
    ''movement-concurrent-001'', ''Concurrent receipt'', ''operator-1'', now()
  )::text'
);
select * from dblink(
  'wave2_a',
  'select public.research_apply_inventory_movement(
    ''00000000-0000-4000-8000-000000000201'', ''receipt'', 10, null, 1,
    ''movement-concurrent-001'', ''Concurrent receipt'', ''operator-1'', now()
  )::text'
) as applied(result text);
select dblink_exec('wave2_a', 'commit');
do $$
declare replay jsonb;
begin
  select result::jsonb into replay
  from dblink_get_result('wave2_b') as completed(result text);
  if replay is null or replay->>'idempotentReplay' <> 'true' then
    raise exception 'concurrent movement did not replay under lock';
  end if;
end;
$$;
select * from dblink_get_result('wave2_b') as drained(result text);

select dblink_exec('wave2_a', 'begin');
select * from dblink(
  'wave2_a',
  'select pg_advisory_xact_lock(hashtextextended(''disposition-concurrent-001'', 0))::text'
) as locked(result text);
select dblink_send_query(
  'wave2_b',
  'select public.research_set_inventory_lot_disposition(
    ''00000000-0000-4000-8000-000000000201'', ''quarantined'', 2,
    ''disposition-concurrent-001'', ''Concurrent disposition'', ''operator-1'', now()
  )::text'
);
select * from dblink(
  'wave2_a',
  'select public.research_set_inventory_lot_disposition(
    ''00000000-0000-4000-8000-000000000201'', ''quarantined'', 2,
    ''disposition-concurrent-001'', ''Concurrent disposition'', ''operator-1'', now()
  )::text'
) as applied(result text);
select dblink_exec('wave2_a', 'commit');
do $$
declare replay jsonb;
begin
  select result::jsonb into replay
  from dblink_get_result('wave2_b') as completed(result text);
  if replay is null or replay->>'idempotentReplay' <> 'true' then
    raise exception 'concurrent disposition did not replay under lock';
  end if;
end;
$$;
select * from dblink_get_result('wave2_b') as drained(result text);

select dblink_exec('wave2_a', 'begin');
select * from dblink(
  'wave2_a',
  'select pg_advisory_xact_lock(hashtextextended(''quality-confirm-concurrent'', 0))::text'
) as locked(result text);
select dblink_send_query(
  'wave2_b',
  'select public.research_manage_lot_quality_document(
    ''00000000-0000-4000-8000-000000000301'', ''confirm_upload'', ''[]''::jsonb, 2,
    ''quality-confirm-concurrent'', ''Concurrent object confirmation'', ''reviewer-1'', now()
  )::text'
);
select * from dblink(
  'wave2_a',
  'select public.research_manage_lot_quality_document(
    ''00000000-0000-4000-8000-000000000301'', ''confirm_upload'', ''[]''::jsonb, 2,
    ''quality-confirm-concurrent'', ''Concurrent object confirmation'', ''reviewer-1'', now()
  )::text'
) as applied(result text);
select dblink_exec('wave2_a', 'commit');
do $$
declare replay jsonb;
begin
  select result::jsonb into replay
  from dblink_get_result('wave2_b') as completed(result text);
  if replay is null or replay->>'idempotentReplay' <> 'true' or replay->>'version' <> '3' then
    raise exception 'concurrent quality command did not replay under lock';
  end if;
end;
$$;
select * from dblink_get_result('wave2_b') as drained(result text);

select dblink_disconnect('wave2_a');
select dblink_disconnect('wave2_b');

do $$
begin
  if (select count(*) from public.research_inventory_movements
      where idempotency_key = 'movement-concurrent-001') <> 1
     or (select count(*) from public.research_inventory_lot_events
         where idempotency_key = 'disposition-concurrent-001') <> 1
     or (select count(*) from public.research_lot_quality_events
         where idempotency_key = 'quality-confirm-concurrent') <> 1 then
    raise exception 'concurrent replay appended duplicate events';
  end if;
end;
$$;

truncate table
  public.research_lot_quality_access_events,
  public.research_lot_quality_events,
  public.research_lot_quality_tests,
  public.research_lot_quality_documents,
  public.research_inventory_lot_events,
  public.research_inventory_movements,
  public.research_lot_allocations,
  public.research_inventory_lots,
  public.research_products
restart identity cascade;

begin;

-- Disposable integration stand-in for the exact accepted server reader. It is
-- transaction-local and rolls back to the migration's deny-by-default hook.
create or replace function public.research_inventory_product_variant_ready(
  p_product_id uuid,
  p_variant_id uuid,
  p_sku text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select p_product_id = '00000000-0000-4000-8000-000000000101'
     and p_variant_id = '00000000-0000-4000-8000-000000000102'
     and p_sku = 'WAVE2-SKU';
$$;

insert into public.research_products(id, sku)
values ('00000000-0000-4000-8000-000000000101', 'WAVE2-SKU');

insert into public.research_inventory_lots(
  id, lot_id, sku, owner, disposition, product_id, variant_id,
  storage_location, supplier_reference, expiry_date, shelf_life_source,
  creation_idempotency_key, creation_command_hash
) values (
  '00000000-0000-4000-8000-000000000201', 'WAVE2-LOT-001', 'WAVE2-SKU', 'xenios',
  'quarantined',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  'A-01', 'SUPPLIER-REF-001', current_date + 365, 'supplier_document',
  'create-lot-wave2-001', repeat('a', 64)
);

do $$
begin
  if public.research_inventory_product_variant_ready(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000999',
    'WAVE2-SKU'
  ) then
    raise exception 'arbitrary variant passed the accepted-contract stand-in';
  end if;
  if public.research_inventory_product_variant_ready(
    '00000000-0000-4000-8000-000000000999',
    '00000000-0000-4000-8000-000000000102',
    'WAVE2-SKU'
  ) then
    raise exception 'cross-product variant passed the accepted-contract stand-in';
  end if;
  if public.research_inventory_product_variant_ready(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
    'MISMATCH-SKU'
  ) then
    raise exception 'SKU mismatch passed the accepted-contract stand-in';
  end if;
end;
$$;

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
  id, lot_id, coa_on_file, document_state, verification_state, version
) values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201',
  false, 'pending', 'pending', 1
);

select public.research_manage_lot_quality_document(
  '00000000-0000-4000-8000-000000000301',
  'replace_upload',
  '{
    "bucketId":"research-coa-production",
    "storageKey":"lots/00000000-0000-4000-8000-000000000201/coa.pdf",
    "documentRef":"lots/00000000-0000-4000-8000-000000000201/coa.pdf",
    "originalFilename":"coa.pdf",
    "contentType":"application/pdf",
    "sizeBytes":100,
    "sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "reportIssuer":"Verified Lab",
    "reportNumber":"REPORT-001",
    "reportDate":"2026-07-26"
  }'::jsonb,
  1,
  'quality-reference-001',
  'Private exact-lot upload reference prepared',
  'reviewer-1',
  now()
);

do $$
declare blocked boolean := false;
begin
  begin
    update public.research_lot_quality_documents
       set report_number = 'REWRITTEN'
     where id = '00000000-0000-4000-8000-000000000301';
  exception when others then blocked := sqlerrm like '%reviewed quality command%'; end;
  if not blocked then raise exception 'direct COA report metadata rewrite was not blocked'; end if;
end;
$$;

select public.research_manage_lot_quality_document(
  '00000000-0000-4000-8000-000000000301', 'confirm_upload', '[]'::jsonb, 2,
  'quality-confirm-001', 'Private exact-lot object verified', 'reviewer-1', now()
);

insert into public.research_lot_quality_tests(
  quality_document_id, test_key, state
)
select
  '00000000-0000-4000-8000-000000000301',
  test_key,
  'not_provided'
from unnest(array[
  'identity', 'assay', 'purity', 'sterility', 'endotoxin', 'particulate',
  'residual_solvents', 'elemental_impurities', 'chain_of_custody'
]) as test_key;

do $$
declare blocked boolean := false;
begin
  begin
    perform public.research_manage_lot_quality_document(
      '00000000-0000-4000-8000-000000000301', 'approve', '[]'::jsonb, 3,
      'quality-approve-missing', 'Review attempted without tests', 'reviewer-1', now()
    );
  exception when others then blocked := sqlerrm like '%tests are not approved%'; end;
  if not blocked then raise exception 'missing tests were treated as passing'; end if;
end;
$$;

-- A non-core test is applicable when it is not explicitly not_applicable. Any
-- failed applicable test, including sterility, must block approval.
do $$
declare blocked boolean := false;
begin
  begin
    perform public.research_manage_lot_quality_document(
      '00000000-0000-4000-8000-000000000301', 'approve',
      '[
        {"testKey":"identity","state":"passed","method":"MS","result":"match","unit":null},
        {"testKey":"assay","state":"passed","method":"HPLC","result":"within specification","unit":"percent"},
        {"testKey":"purity","state":"passed","method":"HPLC","result":"within specification","unit":"percent"},
        {"testKey":"sterility","state":"failed","method":"USP","result":"failed","unit":null},
        {"testKey":"endotoxin","state":"not_applicable","method":null,"result":null,"unit":null},
        {"testKey":"particulate","state":"not_applicable","method":null,"result":null,"unit":null},
        {"testKey":"residual_solvents","state":"not_applicable","method":null,"result":null,"unit":null},
        {"testKey":"elemental_impurities","state":"not_applicable","method":null,"result":null,"unit":null},
        {"testKey":"chain_of_custody","state":"passed","method":"document review","result":"verified","unit":null}
      ]'::jsonb,
      3, 'quality-approve-failed-sterility', 'Sterility failure must block', 'reviewer-1', now()
    );
  exception when others then blocked := sqlerrm like '%tests are not approved%'; end;
  if not blocked then raise exception 'failed sterility was treated as passing'; end if;
end;
$$;

select public.research_manage_lot_quality_document(
  '00000000-0000-4000-8000-000000000301', 'approve',
  '[
    {"testKey":"identity","state":"passed","method":"MS","result":"match","unit":null},
    {"testKey":"assay","state":"passed","method":"HPLC","result":"within specification","unit":"percent"},
    {"testKey":"purity","state":"passed","method":"HPLC","result":"within specification","unit":"percent"},
    {"testKey":"sterility","state":"not_applicable","method":null,"result":null,"unit":null},
    {"testKey":"endotoxin","state":"not_applicable","method":null,"result":null,"unit":null},
    {"testKey":"particulate","state":"not_applicable","method":null,"result":null,"unit":null},
    {"testKey":"residual_solvents","state":"not_applicable","method":null,"result":null,"unit":null},
    {"testKey":"elemental_impurities","state":"not_applicable","method":null,"result":null,"unit":null},
    {"testKey":"chain_of_custody","state":"passed","method":"document review","result":"verified","unit":null}
  ]'::jsonb,
  3, 'quality-approve-001', 'Exact product variant lot and report reviewed', 'reviewer-1', now()
);

select public.research_manage_lot_quality_document(
  '00000000-0000-4000-8000-000000000301', 'publish', '[]'::jsonb, 4,
  'quality-publish-001', 'Approved exact-lot COA published', 'reviewer-1', now()
);

do $$
declare blocked boolean := false;
begin
  begin
    update public.research_lot_quality_documents
       set private_storage_key = 'lots/00000000-0000-4000-8000-000000000201/rewrite.pdf'
     where id = '00000000-0000-4000-8000-000000000301';
  exception when others then blocked := sqlerrm like '%reviewed quality command%'; end;
  if not blocked then raise exception 'published COA object rewrite was not blocked'; end if;
  if not public.research_lot_quality_ready(
    '00000000-0000-4000-8000-000000000201',
    now()
  ) then
    raise exception 'blocked metadata mutation changed readiness';
  end if;
end;
$$;

do $$
declare blocked boolean := false;
begin
  begin
    update public.research_lot_quality_tests
       set state = 'failed', method = 'rewrite', result = 'rewrite'
     where quality_document_id = '00000000-0000-4000-8000-000000000301'
       and test_key = 'sterility';
  exception when others then blocked := sqlerrm like '%reviewed quality command%'; end;
  if not blocked then raise exception 'published quality test mutation was not blocked'; end if;
  if not public.research_lot_quality_ready(
    '00000000-0000-4000-8000-000000000201',
    now()
  ) then
    raise exception 'blocked test mutation changed readiness';
  end if;
end;
$$;

select public.research_authorize_lot_quality_access(
  '00000000-0000-4000-8000-000000000301',
  'reviewer-a',
  'quality_review',
  '00000000-0000-4000-8000-000000000401',
  now()
);
select public.research_authorize_lot_quality_access(
  '00000000-0000-4000-8000-000000000301',
  'reviewer-b',
  'compliance_review',
  '00000000-0000-4000-8000-000000000402',
  now()
);

do $$
declare blocked boolean := false;
begin
  if (select count(distinct actor_id)
      from public.research_lot_quality_access_events
      where quality_document_id = '00000000-0000-4000-8000-000000000301') <> 2 then
    raise exception 'private COA access actors were not isolated in audit';
  end if;
  begin
    update public.research_lot_quality_access_events
       set actor_id = 'rewritten-actor'
     where id = '00000000-0000-4000-8000-000000000401';
  exception when others then blocked := sqlerrm like '%append-only%'; end;
  if not blocked then raise exception 'private access audit was mutable'; end if;
end;
$$;

do $$
declare blocked boolean := false;
begin
  begin
    perform public.research_authorize_lot_quality_access(
      '00000000-0000-4000-8000-000000000301',
      'reviewer-c',
      'unspecified',
      '00000000-0000-4000-8000-000000000403',
      now()
    );
  exception when others then blocked := sqlerrm like '%metadata is incomplete%'; end;
  if not blocked then raise exception 'private access without approved purpose was granted'; end if;
  if exists (
    select 1 from public.research_lot_quality_access_events
    where id = '00000000-0000-4000-8000-000000000403'
  ) then
    raise exception 'failed access authorization left an audit grant row';
  end if;
end;
$$;

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

do $$
declare blocked boolean := false;
begin
  begin
    update public.research_inventory_movements
       set reason = 'rewrite'
     where idempotency_key = 'movement-receipt-001';
  exception when others then blocked := sqlerrm like '%append-only%'; end;
  if not blocked then raise exception 'movement history update was not blocked'; end if;
end;
$$;

select public.research_set_inventory_lot_disposition(
  '00000000-0000-4000-8000-000000000201', 'quarantined', 10,
  'lot-quarantine-001', 'Controlled disposition test', 'operator-1', now()
);
do $$
declare blocked boolean := false;
begin
  begin
    perform public.research_apply_inventory_movement(
      '00000000-0000-4000-8000-000000000201', 'reserve', 1, null, 11,
      'movement-blocked-001', 'Must be blocked', 'operator-1', now()
    );
  exception when others then blocked := sqlerrm like '%not allocatable%'; end;
  if not blocked then raise exception 'quarantined lot was allocatable'; end if;
end;
$$;

select public.research_set_inventory_lot_disposition(
  '00000000-0000-4000-8000-000000000201', 'available', 11,
  'lot-rerelease-001', 'Restore approved disposition', 'operator-1', now()
);

update public.research_inventory_lots
set expiry_date = current_date - 1
where id = '00000000-0000-4000-8000-000000000201';
do $$
begin
  if public.research_lot_is_allocatable(
    '00000000-0000-4000-8000-000000000201',
    now()
  ) then
    raise exception 'expired lot was allocatable';
  end if;
end;
$$;
update public.research_inventory_lots
set expiry_date = current_date + 365, recalled = true, recalled_at = now()
where id = '00000000-0000-4000-8000-000000000201';
do $$
begin
  if public.research_lot_is_allocatable(
    '00000000-0000-4000-8000-000000000201',
    now()
  ) then
    raise exception 'recalled lot was allocatable';
  end if;
end;
$$;

do $$
declare l public.research_inventory_lots%rowtype;
begin
  select * into l
  from public.research_inventory_lots
  where id = '00000000-0000-4000-8000-000000000201';
  if (
    l.quantity_received,
    l.quantity_available,
    l.quantity_reserved,
    l.quantity_quarantined,
    l.quantity_damaged
  ) <> (100, 87, 5, 5, 3) then
    raise exception 'exact quantity invariant mismatch: %, %, %, %, %',
      l.quantity_received,
      l.quantity_available,
      l.quantity_reserved,
      l.quantity_quarantined,
      l.quantity_damaged;
  end if;
  if (select count(*) from public.research_inventory_movements) <> 8 then
    raise exception 'unexpected movement history count';
  end if;
end;
$$;

rollback;

do $$
begin
  if (select count(*) from public.research_products) <> 0
     or (select count(*) from public.research_inventory_lots) <> 0
     or (select count(*) from public.research_lot_quality_documents) <> 0
     or (select count(*) from public.research_inventory_movements) <> 0
     or (select count(*) from public.research_lot_quality_tests) <> 0
     or (select count(*) from public.research_lot_quality_access_events) <> 0 then
    raise exception 'disposable verification left residual rows';
  end if;
  if public.research_inventory_product_variant_ready(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
    'WAVE2-SKU'
  ) then
    raise exception 'transaction-local product-control stand-in did not roll back';
  end if;
end;
$$;

select 'WAVE2_DISPOSABLE_VERIFICATION_OK' as result;
