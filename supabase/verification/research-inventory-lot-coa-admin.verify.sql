\set ON_ERROR_STOP on

-- Website 4 Wave 2 disposable verifier. Run after bootstrap and applying the
-- candidate twice. It proves the final privilege posture and command semantics
-- without mutating production.

do $$
declare
  target_table text;
  table_privilege_count integer;
  execute_privilege_count integer;
begin
  foreach target_table in array array[
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
      select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = target_table
         and c.relrowsecurity
         and c.relforcerowsecurity
    ) then
      raise exception 'RLS is not forced on %', target_table;
    end if;
    if has_table_privilege('anon', 'public.' || target_table, 'select')
       or has_table_privilege('authenticated', 'public.' || target_table, 'select')
       or has_table_privilege('anon', 'public.' || target_table, 'insert')
       or has_table_privilege('authenticated', 'public.' || target_table, 'insert') then
      raise exception 'browser grant remains on %', target_table;
    end if;
  end loop;

  select count(*) into table_privilege_count
    from information_schema.role_table_grants
   where grantee = 'service_role'
     and table_schema = 'public'
     and table_name in (
       'research_inventory_lots',
       'research_lot_quality_documents',
       'research_lot_allocations',
       'research_inventory_movements',
       'research_inventory_lot_events',
       'research_lot_quality_tests',
       'research_lot_quality_events',
       'research_lot_quality_access_events'
     );
  if table_privilege_count <> 8 then
    raise exception 'expected 8 service-role table privileges, found %',
      table_privilege_count;
  end if;
  if exists (
    select 1
      from information_schema.role_table_grants
     where grantee = 'service_role'
       and table_schema = 'public'
       and table_name in (
         'research_inventory_lots',
         'research_lot_quality_documents',
         'research_lot_allocations',
         'research_inventory_movements',
         'research_inventory_lot_events',
         'research_lot_quality_tests',
         'research_lot_quality_events',
         'research_lot_quality_access_events'
       )
       and privilege_type <> 'SELECT'
  ) then
    raise exception 'service role retains direct command-table DML';
  end if;

  select count(*) into execute_privilege_count
    from (
      values
        ('public.research_inventory_product_variant_ready(uuid,uuid,text)'),
        ('public.research_lot_quality_tests_ready(uuid)'),
        ('public.research_authorize_lot_quality_access(uuid,text,text,uuid,timestamptz)'),
        ('public.research_lot_is_allocatable(uuid,timestamptz)'),
        ('public.research_lot_quality_ready(uuid,timestamptz)'),
        ('public.research_create_inventory_lot(text,text,uuid,uuid,text,text,text,date,date,date,text,text,text,timestamptz)'),
        ('public.research_prepare_lot_quality_upload(uuid,jsonb,text,text,text,timestamptz)'),
        ('public.research_apply_inventory_movement(uuid,text,integer,text,bigint,text,text,text,timestamptz)'),
        ('public.research_set_inventory_lot_disposition(uuid,text,bigint,text,text,text,timestamptz)'),
        ('public.research_manage_lot_quality_document(uuid,text,jsonb,bigint,text,text,text,timestamptz)')
    ) as expected(signature)
   where has_function_privilege('service_role', signature, 'execute');
  if execute_privilege_count <> 10 then
    raise exception 'expected 10 reviewed RPC grants, found %',
      execute_privilege_count;
  end if;
end;
$$;

create extension if not exists dblink;

insert into public.research_products(id, sku, admin_status, active_state)
values (
  '00000000-0000-4000-8000-000000000101',
  'PRODUCT-WAVE2',
  'approved',
  true
);
insert into public.research_product_variants(
  id, product_id, sku, status, active
) values (
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000101',
  'WAVE2-SKU',
  'approved',
  true
);

do $$
begin
  if not public.research_inventory_product_variant_ready(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
    'WAVE2-SKU'
  ) then
    raise exception 'accepted exact product/variant/SKU did not pass';
  end if;
  if public.research_inventory_product_variant_ready(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000999',
    'WAVE2-SKU'
  ) or public.research_inventory_product_variant_ready(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
    'MISMATCH-SKU'
  ) then
    raise exception 'invalid product/variant/SKU binding passed';
  end if;
end;
$$;

-- Direct service-role lot creation must fail before any stock can exist.
do $$
declare
  blocked boolean := false;
begin
  begin
    execute 'set local role service_role';
    insert into public.research_inventory_lots(
      id, lot_id, sku, owner, disposition, product_id, variant_id,
      quantity_received, quantity_available, version
    ) values (
      '00000000-0000-4000-8000-000000000299',
      'DIRECT-BYPASS',
      'WAVE2-SKU',
      'xenios',
      'available',
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102',
      50, 50, 99
    );
  exception when insufficient_privilege then
    blocked := true;
  end;
  execute 'reset role';
  if not blocked then
    raise exception 'service-role direct lot insert was not denied';
  end if;
end;
$$;

-- Concurrent create-lot replay: one lot, one immutable created event.
select dblink_connect('wave2_create_a', 'dbname=' || current_database());
select dblink_connect('wave2_create_b', 'dbname=' || current_database());
select dblink_exec('wave2_create_a', 'begin');
select * from dblink(
  'wave2_create_a',
  'select pg_advisory_xact_lock(hashtextextended(''create-concurrent-001'',0))::text'
) as locked(result text);
select dblink_send_query(
  'wave2_create_b',
  $q$select public.research_create_inventory_lot(
    'WAVE2-CONCURRENT-LOT','WAVE2-SKU',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
    'xenios','A-01','SUPPLIER-CONCURRENT',null,current_date+365,null,
    'supplier_document','create-concurrent-001','operator-1',now()
  )::text$q$
);
select * from dblink(
  'wave2_create_a',
  $q$select public.research_create_inventory_lot(
    'WAVE2-CONCURRENT-LOT','WAVE2-SKU',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
    'xenios','A-01','SUPPLIER-CONCURRENT',null,current_date+365,null,
    'supplier_document','create-concurrent-001','operator-1',now()
  )::text$q$
) as applied(result text);
select dblink_exec('wave2_create_a', 'commit');
do $$
declare replay jsonb;
begin
  select result::jsonb into replay
    from dblink_get_result('wave2_create_b') as completed(result text);
  if replay->>'idempotentReplay' <> 'true' then
    raise exception 'concurrent create did not replay';
  end if;
end;
$$;
select * from dblink_get_result('wave2_create_b') as drained(result text);
select dblink_disconnect('wave2_create_a');
select dblink_disconnect('wave2_create_b');

do $$
declare
  l public.research_inventory_lots%rowtype;
  blocked boolean := false;
begin
  select * into l
    from public.research_inventory_lots
   where creation_idempotency_key = 'create-concurrent-001';
  if l.disposition <> 'quarantined'
     or l.version <> 1
     or (l.quantity_received, l.quantity_available, l.quantity_reserved,
         l.quantity_quarantined, l.quantity_damaged) <> (0,0,0,0,0) then
    raise exception 'created lot did not start quarantined at zero/version 1';
  end if;
  if (select count(*) from public.research_inventory_lots
      where creation_idempotency_key = 'create-concurrent-001') <> 1
     or (select count(*) from public.research_inventory_lot_events
         where lot_id = l.id and event_type = 'created') <> 1 then
    raise exception 'create replay duplicated lot or created event';
  end if;
  begin
    perform public.research_create_inventory_lot(
      'WAVE2-DIFFERENT-LOT','WAVE2-SKU',
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102',
      'xenios','A-01','SUPPLIER-CONCURRENT',null,current_date+365,null,
      'supplier_document','create-concurrent-001','operator-1',now()
    );
  exception when others then
    blocked := sqlerrm like '%different lot creation command%';
  end;
  if not blocked then raise exception 'create idempotency mismatch was not denied'; end if;
end;
$$;

-- Concurrent upload preparation must persist and replay one identity.
select dblink_connect('wave2_upload_a', 'dbname=' || current_database());
select dblink_connect('wave2_upload_b', 'dbname=' || current_database());
select dblink_exec('wave2_upload_a', 'begin');
select * from dblink(
  'wave2_upload_a',
  'select pg_advisory_xact_lock(hashtextextended(''upload-concurrent-001'',0))::text'
) as locked(result text);
select dblink_send_query(
  'wave2_upload_b',
  $q$select public.research_prepare_lot_quality_upload(
    (select id from public.research_inventory_lots
      where creation_idempotency_key='create-concurrent-001'),
    '{"bucketId":"research-coa-production","originalFilename":"concurrent.pdf",
      "contentType":"application/pdf","sizeBytes":100,
      "sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "reportIssuer":"Verified Lab","reportNumber":"CONCURRENT-REPORT",
      "reportDate":"2026-07-26"}'::jsonb,
    'upload-concurrent-001','Prepare concurrent exact-lot COA','reviewer-1',now()
  )::text$q$
);
select * from dblink(
  'wave2_upload_a',
  $q$select public.research_prepare_lot_quality_upload(
    (select id from public.research_inventory_lots
      where creation_idempotency_key='create-concurrent-001'),
    '{"bucketId":"research-coa-production","originalFilename":"concurrent.pdf",
      "contentType":"application/pdf","sizeBytes":100,
      "sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "reportIssuer":"Verified Lab","reportNumber":"CONCURRENT-REPORT",
      "reportDate":"2026-07-26"}'::jsonb,
    'upload-concurrent-001','Prepare concurrent exact-lot COA','reviewer-1',now()
  )::text$q$
) as applied(result text);
select dblink_exec('wave2_upload_a', 'commit');
do $$
declare replay jsonb;
begin
  select result::jsonb into replay
    from dblink_get_result('wave2_upload_b') as completed(result text);
  if replay->>'idempotentReplay' <> 'true' then
    raise exception 'concurrent upload preparation did not replay';
  end if;
end;
$$;
select * from dblink_get_result('wave2_upload_b') as drained(result text);
select dblink_disconnect('wave2_upload_a');
select dblink_disconnect('wave2_upload_b');

do $$
begin
  if (select count(*) from public.research_lot_quality_documents) <> 1
     or (select count(*) from public.research_lot_quality_tests) <> 9
     or (select count(*) from public.research_lot_quality_events
         where event_type = 'upload_referenced') <> 1 then
    raise exception 'upload replay duplicated document, tests, or transition';
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
  public.research_inventory_lots
restart identity cascade;

begin;

select public.research_create_inventory_lot(
  'WAVE2-LOT-001','WAVE2-SKU',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  'xenios','A-01','SUPPLIER-001',null,current_date+365,null,
  'supplier_document','create-wave2-001','operator-1',now()
);

-- NULL, zero, and negative expected versions must fail before mutation.
do $$
declare
  lot uuid := (select id from public.research_inventory_lots
               where creation_idempotency_key = 'create-wave2-001');
  candidate bigint;
  blocked boolean;
  before_version bigint;
begin
  select version into before_version from public.research_inventory_lots where id = lot;
  foreach candidate in array array[null::bigint,0::bigint,-1::bigint]
  loop
    blocked := false;
    begin
      perform public.research_apply_inventory_movement(
        lot,'receipt',1,null,candidate,
        'bad-movement-' || coalesce(candidate::text,'null'),
        'Invalid version probe','operator-1',now()
      );
    exception when others then
      blocked := sqlerrm like '%expected version must be positive%';
    end;
    if not blocked then raise exception 'movement accepted invalid version %', candidate; end if;

    blocked := false;
    begin
      perform public.research_set_inventory_lot_disposition(
        lot,'quality_hold',candidate,
        'bad-status-' || coalesce(candidate::text,'null'),
        'Invalid version probe','operator-1',now()
      );
    exception when others then
      blocked := sqlerrm like '%expected version must be positive%';
    end;
    if not blocked then raise exception 'disposition accepted invalid version %', candidate; end if;
  end loop;
  if (select version from public.research_inventory_lots where id = lot) <> before_version
     or exists (select 1 from public.research_inventory_movements)
     or (select count(*) from public.research_inventory_lot_events
         where event_type <> 'created') <> 0 then
    raise exception 'invalid version probe changed lot state or history';
  end if;
end;
$$;

-- Legal movement/lifecycle path and blocked skipped/terminal states.
select public.research_apply_inventory_movement(
  (select id from public.research_inventory_lots where creation_idempotency_key='create-wave2-001'),
  'receipt',10,null,1,'receipt-wave2-001','Verified receipt','operator-1',now()
);
do $$
declare
  lot uuid := (select id from public.research_inventory_lots
               where creation_idempotency_key='create-wave2-001');
  blocked boolean := false;
  before_version bigint;
begin
  select version into before_version from public.research_inventory_lots where id=lot;
  begin
    perform public.research_set_inventory_lot_disposition(
      lot,'shipped',before_version,'skip-to-shipped-001',
      'Skipped lifecycle probe','operator-1',now()
    );
  exception when others then blocked := sqlerrm like '%illegal inventory lot disposition%'; end;
  if not blocked then raise exception 'quarantined lot skipped directly to shipped'; end if;
  if (select version from public.research_inventory_lots where id=lot) <> before_version then
    raise exception 'illegal disposition changed version';
  end if;
end;
$$;

select public.research_set_inventory_lot_disposition(
  (select id from public.research_inventory_lots where creation_idempotency_key='create-wave2-001'),
  'damaged',2,'status-damaged-001','Damage disposition test','operator-1',now()
);
do $$
declare
  lot uuid := (select id from public.research_inventory_lots
               where creation_idempotency_key='create-wave2-001');
  blocked boolean := false;
  before_version bigint := (select version from public.research_inventory_lots where id=lot);
  before_events integer := (select count(*) from public.research_inventory_movements where lot_id=lot);
begin
  begin
    perform public.research_apply_inventory_movement(
      lot,'damage',1,'quarantined',before_version,
      'repeat-damage-001','Repeated damage probe','operator-1',now()
    );
  exception when others then blocked := sqlerrm like '%terminal, recalled, or expired%'; end;
  if not blocked then raise exception 'already-damaged lot accepted another movement'; end if;
  if (select version from public.research_inventory_lots where id=lot) <> before_version
     or (select count(*) from public.research_inventory_movements where lot_id=lot) <> before_events then
    raise exception 'blocked terminal movement changed state or history';
  end if;
end;
$$;

-- Build a second lot for exact-lot quality and replacement proofs.
select public.research_create_inventory_lot(
  'WAVE2-LOT-QUALITY','WAVE2-SKU',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  'xenios','A-02','SUPPLIER-QUALITY',null,current_date+365,null,
  'supplier_document','create-quality-001','operator-1',now()
);
select public.research_prepare_lot_quality_upload(
  (select id from public.research_inventory_lots where creation_idempotency_key='create-quality-001'),
  '{"bucketId":"research-coa-production","originalFilename":"quality-v1.pdf",
    "contentType":"application/pdf","sizeBytes":100,
    "sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "reportIssuer":"Verified Lab","reportNumber":"QUALITY-V1",
    "reportDate":"2026-07-26"}'::jsonb,
  'prepare-quality-v1','Prepare quality version one','reviewer-1',now()
);

do $$
declare
  document uuid := (select id from public.research_lot_quality_documents
                    where superseded_at is null);
  candidate bigint;
  blocked boolean;
begin
  foreach candidate in array array[null::bigint,0::bigint,-1::bigint]
  loop
    blocked := false;
    begin
      perform public.research_manage_lot_quality_document(
        document,'confirm_upload','[]'::jsonb,candidate,
        'bad-quality-' || coalesce(candidate::text,'null'),
        'Invalid quality version probe','reviewer-1',now()
      );
    exception when others then
      blocked := sqlerrm like '%expected version must be positive%';
    end;
    if not blocked then raise exception 'quality accepted invalid version %', candidate; end if;
  end loop;
  if (select version from public.research_lot_quality_documents where id=document) <> 1
     or (select count(*) from public.research_lot_quality_events
         where quality_document_id=document) <> 1 then
    raise exception 'invalid quality versions changed document or history';
  end if;
end;
$$;

select public.research_manage_lot_quality_document(
  (select id from public.research_lot_quality_documents where superseded_at is null),
  'confirm_upload','[]'::jsonb,1,'confirm-quality-v1',
  'Confirm private object','reviewer-1',now()
);

do $$
declare
  document uuid := (select id from public.research_lot_quality_documents
                    where superseded_at is null);
  blocked boolean := false;
begin
  begin
    perform public.research_manage_lot_quality_document(
      document,'approve',
      '[
        {"testKey":"identity","state":"passed","method":"MS","result":"match","unit":null},
        {"testKey":"assay","state":"passed","method":"HPLC","result":"ok","unit":"percent"},
        {"testKey":"purity","state":"passed","method":"HPLC","result":"ok","unit":"percent"},
        {"testKey":"sterility","state":"failed","method":"USP","result":"failed","unit":null},
        {"testKey":"endotoxin","state":"not_applicable","method":null,"result":null,"unit":null},
        {"testKey":"particulate","state":"not_applicable","method":null,"result":null,"unit":null},
        {"testKey":"residual_solvents","state":"not_applicable","method":null,"result":null,"unit":null},
        {"testKey":"elemental_impurities","state":"not_applicable","method":null,"result":null,"unit":null},
        {"testKey":"chain_of_custody","state":"passed","method":"review","result":"verified","unit":null}
      ]'::jsonb,
      2,'approve-failed-sterility','Failed sterility probe','reviewer-1',now()
    );
  exception when others then blocked := sqlerrm like '%tests are not approved%'; end;
  if not blocked then raise exception 'failed sterility was approved'; end if;
end;
$$;

select public.research_manage_lot_quality_document(
  (select id from public.research_lot_quality_documents where superseded_at is null),
  'approve',
  '[
    {"testKey":"identity","state":"passed","method":"MS","result":"match","unit":null},
    {"testKey":"assay","state":"passed","method":"HPLC","result":"ok","unit":"percent"},
    {"testKey":"purity","state":"passed","method":"HPLC","result":"ok","unit":"percent"},
    {"testKey":"sterility","state":"not_applicable","method":null,"result":null,"unit":null},
    {"testKey":"endotoxin","state":"not_applicable","method":null,"result":null,"unit":null},
    {"testKey":"particulate","state":"not_applicable","method":null,"result":null,"unit":null},
    {"testKey":"residual_solvents","state":"not_applicable","method":null,"result":null,"unit":null},
    {"testKey":"elemental_impurities","state":"not_applicable","method":null,"result":null,"unit":null},
    {"testKey":"chain_of_custody","state":"passed","method":"review","result":"verified","unit":null}
  ]'::jsonb,
  2,'approve-quality-v1','Approve exact-lot tests','reviewer-1',now()
);
select public.research_manage_lot_quality_document(
  (select id from public.research_lot_quality_documents where superseded_at is null),
  'publish','[]'::jsonb,3,'publish-quality-v1',
  'Publish exact-lot COA','reviewer-1',now()
);

do $$
declare
  document uuid := (select id from public.research_lot_quality_documents
                    where superseded_at is null);
  blocked boolean := false;
begin
  begin
    update public.research_lot_quality_documents
       set report_number='MUTATED'
     where id=document;
  exception when others then blocked := sqlerrm like '%reviewed quality command%'; end;
  if not blocked then raise exception 'direct published metadata mutation was not denied'; end if;
  blocked := false;
  begin
    perform public.research_manage_lot_quality_document(
      document,'replace_upload','{}'::jsonb,4,'generic-replace-denied',
      'Generic replacement denial','reviewer-1',now()
    );
  exception when others then blocked := sqlerrm like '%invalid lot quality action%'; end;
  if not blocked then raise exception 'generic replace_upload command was not denied'; end if;
end;
$$;

-- publish -> withdraw -> replace preserves prior metadata/history.
select public.research_manage_lot_quality_document(
  (select id from public.research_lot_quality_documents where superseded_at is null),
  'withdraw','[]'::jsonb,4,'withdraw-quality-v1',
  'Withdraw published COA','reviewer-1',now()
);
select public.research_prepare_lot_quality_upload(
  (select id from public.research_inventory_lots where creation_idempotency_key='create-quality-001'),
  '{"bucketId":"research-coa-production","originalFilename":"quality-v2.pdf",
    "contentType":"application/pdf","sizeBytes":101,
    "sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "reportIssuer":"Verified Lab","reportNumber":"QUALITY-V2",
    "reportDate":"2026-07-27"}'::jsonb,
  'prepare-quality-v2','Replace withdrawn quality report','reviewer-1',now()
);

do $$
declare
  old_document public.research_lot_quality_documents%rowtype;
  new_document public.research_lot_quality_documents%rowtype;
begin
  select * into old_document
    from public.research_lot_quality_documents
   where report_number='QUALITY-V1';
  select * into new_document
    from public.research_lot_quality_documents
   where report_number='QUALITY-V2';
  if old_document.report_number <> 'QUALITY-V1'
     or old_document.private_storage_key not like '%quality-v1.pdf'
     or old_document.superseded_at is null
     or old_document.superseded_by <> new_document.id
     or new_document.replaces_document_id <> old_document.id
     or old_document.published_at is null
     or (select count(*) from public.research_lot_quality_events
         where quality_document_id=old_document.id and event_type='superseded') <> 1 then
    raise exception 'withdrawn replacement did not preserve immutable history';
  end if;
end;
$$;

-- confirm -> reject -> replace follows the same audited version path.
select public.research_manage_lot_quality_document(
  (select id from public.research_lot_quality_documents where superseded_at is null),
  'confirm_upload','[]'::jsonb,1,'confirm-quality-v2',
  'Confirm replacement object','reviewer-1',now()
);
select public.research_manage_lot_quality_document(
  (select id from public.research_lot_quality_documents where superseded_at is null),
  'reject','[]'::jsonb,2,'reject-quality-v2',
  'Reject replacement report','reviewer-1',now()
);
select public.research_prepare_lot_quality_upload(
  (select id from public.research_inventory_lots where creation_idempotency_key='create-quality-001'),
  '{"bucketId":"research-coa-production","originalFilename":"quality-v3.pdf",
    "contentType":"application/pdf","sizeBytes":102,
    "sha256":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "reportIssuer":"Verified Lab","reportNumber":"QUALITY-V3",
    "reportDate":"2026-07-28"}'::jsonb,
  'prepare-quality-v3','Replace rejected quality report','reviewer-1',now()
);

do $$
begin
  if (select count(*) from public.research_lot_quality_documents
      where superseded_at is null) <> 1
     or (select count(*) from public.research_lot_quality_documents) <> 3
     or (select count(*) from public.research_lot_quality_events
         where event_type='superseded') <> 2 then
    raise exception 'replacement history cardinality is incorrect';
  end if;
end;
$$;

rollback;

truncate table
  public.research_lot_quality_access_events,
  public.research_lot_quality_events,
  public.research_lot_quality_tests,
  public.research_lot_quality_documents,
  public.research_inventory_lot_events,
  public.research_inventory_movements,
  public.research_lot_allocations,
  public.research_inventory_lots,
  public.research_product_variants,
  public.research_products
restart identity cascade;

do $$
begin
  if (select count(*) from public.research_products) <> 0
     or (select count(*) from public.research_product_variants) <> 0
     or (select count(*) from public.research_inventory_lots) <> 0
     or (select count(*) from public.research_lot_quality_documents) <> 0
     or (select count(*) from public.research_inventory_movements) <> 0
     or (select count(*) from public.research_lot_quality_events) <> 0 then
    raise exception 'disposable verifier left residual business rows';
  end if;
end;
$$;

select 'WAVE2_DISPOSABLE_VERIFICATION_OK' as result;
