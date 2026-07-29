\set ON_ERROR_STOP on

do $verify$
declare
  v_table text;
  v_table_grants integer;
  v_rpc_grants integer;
begin
  foreach v_table in array array[
    'research_fulfillment_suppliers',
    'research_fulfillment_supplier_users',
    'research_supplier_offers',
    'research_supplier_fulfillment_orders',
    'research_supplier_fulfillment_lines',
    'research_fulfillment_assignments',
    'research_fulfillment_assignment_lines',
    'research_fulfillment_events',
    'research_fulfillment_exceptions',
    'research_supplier_settlements',
    'research_supplier_settlement_events'
  ]
  loop
    if not exists (
      select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = v_table
         and c.relrowsecurity
         and c.relforcerowsecurity
    ) then
      raise exception 'RLS is not forced on %', v_table;
    end if;
    if exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = v_table
    ) then
      raise exception 'unexpected browser policy exists on %', v_table;
    end if;
    if has_table_privilege('anon', 'public.' || v_table, 'select')
       or has_table_privilege('authenticated', 'public.' || v_table, 'select')
       or has_table_privilege('anon', 'public.' || v_table, 'insert')
       or has_table_privilege('authenticated', 'public.' || v_table, 'insert') then
      raise exception 'browser grant remains on %', v_table;
    end if;
  end loop;

  select count(*) into v_table_grants
    from information_schema.role_table_grants
   where grantee = 'service_role'
     and table_schema = 'public'
     and table_name in (
       'research_fulfillment_suppliers',
       'research_fulfillment_supplier_users',
       'research_supplier_offers',
       'research_supplier_fulfillment_orders',
       'research_supplier_fulfillment_lines',
       'research_fulfillment_assignments',
       'research_fulfillment_assignment_lines',
       'research_fulfillment_events',
       'research_fulfillment_exceptions',
       'research_supplier_settlements',
       'research_supplier_settlement_events'
     );
  if v_table_grants <> 11 then
    raise exception 'expected 11 SELECT-only service grants, found %', v_table_grants;
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where grantee = 'service_role'
       and table_schema = 'public'
       and table_name like 'research_fulfillment%'
       and privilege_type <> 'SELECT'
  ) or exists (
    select 1 from information_schema.role_table_grants
     where grantee = 'service_role'
       and table_schema = 'public'
       and table_name in (
         'research_supplier_offers',
         'research_supplier_settlements',
         'research_supplier_settlement_events'
       )
       and privilege_type <> 'SELECT'
  ) then
    raise exception 'service role retains direct fulfillment DML';
  end if;

  select count(*) into v_rpc_grants
    from (
      values
        ('public.research_fulfillment_onboard_supplier(uuid,text,text,text,text,bigint,text,timestamp with time zone)'),
        ('public.research_fulfillment_assign_supplier_user(uuid,uuid,uuid,text,bigint,text,timestamp with time zone)'),
        ('public.research_fulfillment_configure_offer(uuid,uuid,uuid,uuid,text,text,text,bigint,text,bigint,text,timestamp with time zone)'),
        ('public.research_fulfillment_list_suppliers(uuid)'),
        ('public.research_fulfillment_list_supplier_offers(uuid,uuid)'),
        ('public.research_fulfillment_list_assignments(uuid,uuid,text[],integer)'),
        ('public.research_fulfillment_assign(uuid,uuid,uuid,uuid,jsonb,bigint,text,timestamp with time zone)'),
        ('public.research_fulfillment_transition(uuid,uuid,uuid,text,bigint,text,timestamp with time zone,timestamp with time zone,text,text,text,text,text)'),
        ('public.research_fulfillment_record_settlement(uuid,uuid,uuid,uuid,bigint,text,text,text,text,timestamp with time zone)')
    ) commands(signature)
   where has_function_privilege('service_role', signature, 'execute');
  if v_rpc_grants <> 9 then
    raise exception 'expected 9 reviewed service functions, found %', v_rpc_grants;
  end if;
  if to_regprocedure(
    'public.research_fulfillment_prepare_order(uuid,uuid,uuid,uuid,jsonb,text,text,bigint,text,timestamp with time zone)'
  ) is not null then
    raise exception 'paid-order preparation RPC must remain unavailable';
  end if;
  if not has_table_privilege(
       'authenticated', 'public.research_fulfillment_orders', 'select'
     )
     or not has_table_privilege(
       'authenticated', 'public.research_fulfillment_lines', 'select'
     )
     or not exists (
       select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'research_fulfillment_orders'
          and column_name = 'legacy_grant_sentinel'
     ) then
    raise exception 'deployed fulfillment schema or grants were not preserved';
  end if;
end;
$verify$;

set role service_role;
do $verify$
begin
  begin
    insert into public.research_fulfillment_suppliers (
      display_name, legal_name, state, provider_mode, version,
      created_by, created_at, updated_by, updated_at
    ) values (
      'BYPASS', 'BYPASS', 'under_review', 'disabled', 1,
      gen_random_uuid(), now(), gen_random_uuid(), now()
    );
    raise exception 'direct service-role fulfillment insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$verify$;
reset role;

do $verify$
begin
  begin
    insert into public.research_supplier_fulfillment_orders(
      id, order_id, member_id, reservation_id, state,
      recipient_name, address_line1, address_city, address_state,
      address_postal_code, address_country, shipping_service,
      handling_profile, version, created_at, updated_at
    ) values (
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
      'ready', 'Bypass', 'Bypass', 'Bypass', 'TX', '00000', 'US',
      'ground', 'ambient', 1, now(), now()
    );
    raise exception 'paid-order boundary bypass unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'paid-order boundary bypass unexpectedly succeeded' then
      raise;
    end if;
    if sqlerrm <> 'canonical paid-order fulfillment boundary is required' then
      raise;
    end if;
  end;
end;
$verify$;

begin;

insert into auth.users(id, email) values
  ('10000000-0000-4000-8000-000000000001', 'operations@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'supplier@example.invalid');
insert into public.research_prelaunch_role_assignments(
  auth_user_id, role, assigned_by, reason, granted_at
) values (
  '10000000-0000-4000-8000-000000000001',
  'operations_admin',
  'disposable-verifier',
  'Disposable authorization proof',
  '2026-07-28T12:00:00.000Z'
);

insert into public.research_products(id, sku, admin_status, active_state)
values (
  '20000000-0000-4000-8000-000000000001',
  'SKU-EXACT',
  'approved',
  true
);
insert into public.research_product_variants(
  id, product_id, sku, status, active
) values (
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  'SKU-EXACT',
  'approved',
  true
);

select set_config('xenios.inventory_command', 'allowed', true);
insert into public.research_inventory_lots(
  id, lot_id, sku, owner, disposition, quantity_available,
  expiry_date, retest_date, shelf_life_source, excursion, recalled,
  product_id, variant_id, storage_location, quantity_received,
  quantity_reserved, quantity_quarantined, quantity_damaged, version,
  created_at, updated_at
) values (
  '30000000-0000-4000-8000-000000000001',
  'LOT-EXACT', 'SKU-EXACT', 'xenios', 'available', 0,
  '2027-12-31', '2027-06-30', 'coa', 'none', false,
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  'VERIFIED LOCATION', 1, 1, 0, 0, 2,
  '2026-07-28T12:00:00.000Z', '2026-07-28T12:00:00.000Z'
);
insert into public.research_inventory_movements(
  id, lot_id, movement_type, quantity, source_bucket,
  available_before, available_after, reserved_before, reserved_after,
  quarantined_before, quarantined_after, damaged_before, damaged_after,
  resulting_version, idempotency_key, command_hash, reason, actor_id, occurred_at
) values (
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  'reserve', 1, 'available',
  1, 0, 0, 1, 0, 0, 0, 0, 2,
  'verify:reserved:1',
  repeat('a', 64),
  'Disposable finalized reservation',
  '10000000-0000-4000-8000-000000000001',
  '2026-07-28T12:00:00.000Z'
);

select set_config('xenios.quality_command', 'allowed', true);
insert into public.research_lot_quality_documents(
  id, lot_id, coa_on_file, identity_confirmed, purity_confirmed,
  sterility_confirmed, endotoxin_confirmed, document_ref, recorded_at,
  document_state, verification_state, private_storage_key, reviewed_at,
  bucket_id, original_filename, content_type, size_bytes, sha256,
  report_issuer, report_number, report_date, reviewed_by,
  published_at, published_by, version
) values (
  '30000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000001',
  true, true, true, true, true, 'private-reference',
  '2026-07-28T12:00:00.000Z', 'available', 'document_on_file',
  'lots/LOT-EXACT/coa.pdf', '2026-07-28T12:00:00.000Z',
  'research-coa-production', 'coa.pdf', 'application/pdf', 1024, repeat('b', 64),
  'Verified laboratory', 'REPORT-1', '2026-07-20',
  '10000000-0000-4000-8000-000000000001',
  '2026-07-28T12:00:00.000Z',
  '10000000-0000-4000-8000-000000000001', 4
);
insert into public.research_lot_quality_tests(
  quality_document_id, test_key, state, method, result, reviewed_by, reviewed_at
)
select
  '30000000-0000-4000-8000-000000000003',
  test_key,
  case
    when test_key in ('identity','assay','purity','chain_of_custody') then 'passed'
    else 'not_applicable'
  end,
  case
    when test_key in ('identity','assay','purity','chain_of_custody') then 'verified-method'
    else null
  end,
  case
    when test_key in ('identity','assay','purity','chain_of_custody') then 'verified-result'
    else null
  end,
  case
    when test_key in ('identity','assay','purity','chain_of_custody')
      then '10000000-0000-4000-8000-000000000001'
    else null
  end,
  case
    when test_key in ('identity','assay','purity','chain_of_custody')
      then '2026-07-28T12:00:00.000Z'::timestamptz
    else null
  end
from unnest(array[
  'identity','assay','purity','sterility','endotoxin','particulate',
  'residual_solvents','elemental_impurities','chain_of_custody'
]) test_key;

select set_config('xenios.inventory_command', 'allowed', true);
insert into public.research_inventory_lots(
  id, lot_id, sku, owner, disposition, quantity_available,
  expiry_date, retest_date, shelf_life_source, excursion, recalled,
  product_id, variant_id, storage_location, quantity_received,
  quantity_reserved, quantity_quarantined, quantity_damaged, version,
  created_at, updated_at
) values (
  '30000000-0000-4000-8000-000000000004',
  'LOT-EXACT-B', 'SKU-EXACT', 'xenios', 'available', 0,
  '2027-12-31', '2027-06-30', 'coa', 'none', false,
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  'VERIFIED LOCATION', 1, 1, 0, 0, 2,
  '2026-07-28T12:00:00.000Z', '2026-07-28T12:00:00.000Z'
);
insert into public.research_inventory_movements(
  id, lot_id, movement_type, quantity, source_bucket,
  available_before, available_after, reserved_before, reserved_after,
  quarantined_before, quarantined_after, damaged_before, damaged_after,
  resulting_version, idempotency_key, command_hash, reason, actor_id, occurred_at
) values (
  '30000000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000004',
  'reserve', 1, 'available',
  1, 0, 0, 1, 0, 0, 0, 0, 2,
  'verify:reserved:2', repeat('c', 64), 'Disposable second lot',
  '10000000-0000-4000-8000-000000000001',
  '2026-07-28T12:00:00.000Z'
);
select set_config('xenios.quality_command', 'allowed', true);
insert into public.research_lot_quality_documents(
  id, lot_id, coa_on_file, identity_confirmed, purity_confirmed,
  sterility_confirmed, endotoxin_confirmed, document_ref, recorded_at,
  document_state, verification_state, private_storage_key, reviewed_at,
  bucket_id, original_filename, content_type, size_bytes, sha256,
  report_issuer, report_number, report_date, reviewed_by,
  published_at, published_by, version
)
select
  '30000000-0000-4000-8000-000000000006',
  '30000000-0000-4000-8000-000000000004',
  coa_on_file, identity_confirmed, purity_confirmed,
  sterility_confirmed, endotoxin_confirmed, document_ref, recorded_at,
  document_state, verification_state, 'lots/LOT-EXACT-B/coa.pdf', reviewed_at,
  bucket_id, original_filename, content_type, size_bytes, repeat('d', 64),
  report_issuer, 'REPORT-2', report_date, reviewed_by,
  published_at, published_by, version
from public.research_lot_quality_documents
where id = '30000000-0000-4000-8000-000000000003';
insert into public.research_lot_quality_tests(
  quality_document_id, test_key, state, method, result, reviewed_by, reviewed_at
)
select
  '30000000-0000-4000-8000-000000000006',
  test_key, state, method, result, reviewed_by, reviewed_at
from public.research_lot_quality_tests
where quality_document_id = '30000000-0000-4000-8000-000000000003';
select set_config('xenios.quality_command', '', true);
select set_config('xenios.inventory_command', '', true);

insert into public.research_lot_reservations(
  id, reservation_id, member_id, sku, quantity, status, expires_at,
  created_at, finalized_at, version, updated_at
) values (
  '40000000-0000-4000-8000-000000000001',
  'reservation:exact:1',
  '40000000-0000-4000-8000-000000000002',
  'SKU-EXACT', 2, 'finalized',
  '2026-07-28T14:00:00.000Z',
  '2026-07-28T12:00:00.000Z',
  '2026-07-28T12:05:00.000Z',
  2, '2026-07-28T12:05:00.000Z'
);
insert into public.research_lot_reservation_allocations(
  id, reservation_id, seq, lot_id, quantity, lot_uuid,
  movement_id, resulting_lot_version
) values (
  '40000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000001',
  0, 'LOT-EXACT', 1,
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002', 2
), (
  '40000000-0000-4000-8000-000000000004',
  '40000000-0000-4000-8000-000000000001',
  1, 'LOT-EXACT-B', 1,
  '30000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000005', 2
);

select (
  public.research_fulfillment_onboard_supplier(
    '10000000-0000-4000-8000-000000000001',
    'Verified supplier', 'Verified Supplier LLC', 'live', 'AGREEMENT-VERIFIED',
    0, 'supplier:onboard:verified:1', '2026-07-28T12:10:00.000Z'
  )->>'recordId'
)::uuid as supplier_id \gset

select public.research_fulfillment_assign_supplier_user(
  '10000000-0000-4000-8000-000000000001',
  :'supplier_id',
  '10000000-0000-4000-8000-000000000002',
  'active', 0, 'supplier:user:verified:1', '2026-07-28T12:11:00.000Z'
);

select (
  public.research_fulfillment_configure_offer(
    '10000000-0000-4000-8000-000000000001',
    :'supplier_id',
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    'SKU-EXACT', 'active', 'USD', 2500, 'AGREEMENT-VERIFIED',
    0, 'supplier:offer:verified:1', '2026-07-28T12:12:00.000Z'
  )->>'recordId'
)::uuid as offer_id \gset

select set_config('xenios.paid_order_boundary', 'allowed', true);
insert into public.research_supplier_fulfillment_orders(
  id, order_id, member_id, reservation_id, state,
  recipient_name, address_line1, address_city, address_state,
  address_postal_code, address_country, shipping_service,
  handling_profile, version, created_at, updated_at
) values (
  '50000000-0000-4000-8000-000000000010',
  '50000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001',
  'ready', 'Disposable Recipient', '10 Verification Way',
  'Austin', 'TX', '78701', 'US', 'ground', 'ambient', 1,
  '2026-07-28T12:13:00.000Z', '2026-07-28T12:13:00.000Z'
);
insert into public.research_supplier_fulfillment_lines(
  id, fulfillment_order_id, sku, quantity, reservation_id
) values (
  '50000000-0000-4000-8000-000000000011',
  '50000000-0000-4000-8000-000000000010',
  'SKU-EXACT', 2, '40000000-0000-4000-8000-000000000001'
);
select set_config('xenios.paid_order_boundary', '', true);

select '50000000-0000-4000-8000-000000000010'::uuid as fulfillment_order_id \gset
select id as fulfillment_line_id
  from public.research_supplier_fulfillment_lines
 where fulfillment_order_id = :'fulfillment_order_id'
\gset

select (
  public.research_fulfillment_assign(
    '10000000-0000-4000-8000-000000000001',
    :'supplier_id', :'offer_id', :'fulfillment_order_id',
    jsonb_build_array(jsonb_build_object(
      'fulfillmentLineId', :'fulfillment_line_id',
      'reservationId', '40000000-0000-4000-8000-000000000001',
      'reservationAllocationId', '40000000-0000-4000-8000-000000000003'
    ), jsonb_build_object(
      'fulfillmentLineId', :'fulfillment_line_id',
      'reservationId', '40000000-0000-4000-8000-000000000001',
      'reservationAllocationId', '40000000-0000-4000-8000-000000000004'
    )),
    0, 'fulfillment:assign:1', '2026-07-28T12:14:00.000Z'
  )->>'assignmentId'
)::uuid as assignment_id \gset

do $verify$
declare
  v_replay jsonb;
  v_supplier_id uuid;
  v_offer_id uuid;
  v_order_id uuid;
  v_line_id uuid;
begin
  select id into v_supplier_id
    from public.research_fulfillment_suppliers
   where legal_name = 'Verified Supplier LLC';
  select id into v_offer_id
    from public.research_supplier_offers
   where supplier_id = v_supplier_id and sku = 'SKU-EXACT';
  select id into v_order_id
    from public.research_supplier_fulfillment_orders
   where order_id = '50000000-0000-4000-8000-000000000001';
  select id into v_line_id
    from public.research_supplier_fulfillment_lines
   where fulfillment_order_id = v_order_id;
  v_replay := public.research_fulfillment_assign(
    '10000000-0000-4000-8000-000000000001',
    v_supplier_id, v_offer_id, v_order_id,
    jsonb_build_array(jsonb_build_object(
      'fulfillmentLineId', v_line_id,
      'reservationId', '40000000-0000-4000-8000-000000000001',
      'reservationAllocationId', '40000000-0000-4000-8000-000000000003'
    ), jsonb_build_object(
      'fulfillmentLineId', v_line_id,
      'reservationId', '40000000-0000-4000-8000-000000000001',
      'reservationAllocationId', '40000000-0000-4000-8000-000000000004'
    )),
    0, 'fulfillment:assign:1', '2026-07-28T12:14:00.000Z'
  );
  if v_replay->>'idempotentReplay' <> 'true' then
    raise exception 'assignment replay was not idempotent';
  end if;
  if (select count(*) from public.research_fulfillment_assignments) <> 1
     or (select count(*) from public.research_fulfillment_assignment_lines) <> 2
     or (
       select sum(quantity) from public.research_fulfillment_assignment_lines
     ) <> 2 then
    raise exception 'assignment replay duplicated state';
  end if;
end;
$verify$;

select public.research_fulfillment_transition(
  '10000000-0000-4000-8000-000000000002', :'supplier_id', :'assignment_id',
  'acknowledge', 1, 'fulfillment:ack:1', '2026-07-28T12:15:00.000Z',
  '2026-07-28T13:00:00.000Z', null, null, null, null, null
);
select public.research_fulfillment_transition(
  '10000000-0000-4000-8000-000000000002', :'supplier_id', :'assignment_id',
  'start_picking', 2, 'fulfillment:pick:1', '2026-07-28T12:16:00.000Z',
  null, null, null, null, null, null
);
select public.research_fulfillment_transition(
  '10000000-0000-4000-8000-000000000002', :'supplier_id', :'assignment_id',
  'pack', 3, 'fulfillment:pack:1', '2026-07-28T12:17:00.000Z',
  null, 'LABEL-VERIFIED', null, null, null, null
);
select public.research_fulfillment_transition(
  '10000000-0000-4000-8000-000000000002', :'supplier_id', :'assignment_id',
  'ship', 4, 'fulfillment:ship:1', '2026-07-28T12:18:00.000Z',
  null, 'LABEL-VERIFIED', 'VERIFIED-CARRIER', 'ground', 'TRACK-VERIFIED', null
);
select public.research_fulfillment_transition(
  '10000000-0000-4000-8000-000000000002', :'supplier_id', :'assignment_id',
  'deliver', 5, 'fulfillment:deliver:1', '2026-07-28T12:19:00.000Z',
  null, null, null, null, null, null
);

select public.research_fulfillment_record_settlement(
  '10000000-0000-4000-8000-000000000001',
  :'supplier_id', :'assignment_id', :'offer_id',
  2500, 'USD', 'AGREEMENT-VERIFIED', null,
  'settlement:verified:1', '2026-07-28T12:20:00.000Z'
);

do $verify$
declare
  v_assignment_id uuid;
begin
  select id into v_assignment_id
    from public.research_fulfillment_assignments;
  begin
    perform public.research_fulfillment_transition(
      '10000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      v_assignment_id, 'record_recall', 6, 'cross:supplier:blocked:1',
      '2026-07-28T12:21:00.000Z', null, null, null, null, null,
      'Cross-supplier probe'
    );
    raise exception 'cross-supplier transition unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'cross-supplier transition unexpectedly succeeded' then raise; end if;
  end;
  begin
    update public.research_fulfillment_events set action = 'tampered'
     where assignment_id = v_assignment_id;
    raise exception 'immutable event update unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'immutable event update unexpectedly succeeded' then raise; end if;
  end;
  if (select state from public.research_fulfillment_assignments where id = v_assignment_id)
     <> 'delivered' then
    raise exception 'cross-supplier probe changed assignment state';
  end if;
end;
$verify$;

rollback;

do $verify$
declare
  v_count bigint;
begin
  select sum(count_rows) into v_count
    from (
      select count(*) count_rows from public.research_fulfillment_suppliers
      union all select count(*) from public.research_fulfillment_supplier_users
      union all select count(*) from public.research_supplier_offers
      union all select count(*) from public.research_supplier_fulfillment_orders
      union all select count(*) from public.research_supplier_fulfillment_lines
      union all select count(*) from public.research_fulfillment_assignments
      union all select count(*) from public.research_fulfillment_assignment_lines
      union all select count(*) from public.research_fulfillment_events
      union all select count(*) from public.research_fulfillment_exceptions
      union all select count(*) from public.research_supplier_settlements
      union all select count(*) from public.research_supplier_settlement_events
    ) counts;
  if v_count <> 0 then
    raise exception 'fulfillment rollback left % residual rows', v_count;
  end if;
end;
$verify$;

do $verify$
declare
  v_count bigint;
begin
  select sum(count_rows) into v_count
    from (
      select count(*) count_rows from public.research_fulfillment_suppliers
      union all select count(*) from public.research_fulfillment_supplier_users
      union all select count(*) from public.research_supplier_offers
      union all select count(*) from public.research_supplier_fulfillment_orders
      union all select count(*) from public.research_fulfillment_assignments
      union all select count(*) from public.research_fulfillment_events
      union all select count(*) from public.research_supplier_settlements
    ) counts;
  if v_count <> 0 then raise exception 'fulfillment verification expected zero rows'; end if;
end;
$verify$;
