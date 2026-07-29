\set ON_ERROR_STOP on

create extension if not exists dblink;

insert into auth.users(id, email) values
  ('70000000-0000-4000-8000-000000000001', 'concurrency-one@example.invalid'),
  ('70000000-0000-4000-8000-000000000002', 'concurrency-two@example.invalid');
insert into public.research_prelaunch_role_assignments(
  auth_user_id, role, assigned_by, reason, granted_at
) values
  (
    '70000000-0000-4000-8000-000000000001',
    'operations_admin',
    'disposable-verifier',
    'Concurrent command proof',
    '2026-07-28T13:00:00.000Z'
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    'operations_admin',
    'disposable-verifier',
    'Cross-actor replay proof',
    '2026-07-28T13:00:00.000Z'
  );

select dblink_connect('fulfill_one', 'dbname=' || current_database());
select dblink_connect('fulfill_two', 'dbname=' || current_database());

select dblink_send_query(
  'fulfill_one',
  $query$
    select public.research_fulfillment_onboard_supplier(
      '70000000-0000-4000-8000-000000000001',
      'Concurrent supplier',
      'Concurrent Supplier LLC',
      'live',
      'AGREEMENT-CONCURRENT',
      0,
      'supplier:concurrent:1',
      '2026-07-28T13:01:00.000Z'
    )
  $query$
);
select dblink_send_query(
  'fulfill_two',
  $query$
    select public.research_fulfillment_onboard_supplier(
      '70000000-0000-4000-8000-000000000001',
      'Concurrent supplier',
      'Concurrent Supplier LLC',
      'live',
      'AGREEMENT-CONCURRENT',
      0,
      'supplier:concurrent:1',
      '2026-07-28T13:01:00.000Z'
    )
  $query$
);

select * from dblink_get_result('fulfill_one') as result(value jsonb);
select * from dblink_get_result('fulfill_two') as result(value jsonb);
select dblink_disconnect('fulfill_one');
select dblink_disconnect('fulfill_two');

do $verify$
begin
  if (select count(*) from public.research_fulfillment_suppliers
       where legal_name = 'Concurrent Supplier LLC') <> 1 then
    raise exception 'concurrent replay created duplicate suppliers';
  end if;
  if (select count(*) from public.research_fulfillment_events
       where action = 'supplier_onboarded') <> 1 then
    raise exception 'concurrent replay created duplicate audit receipts';
  end if;
  begin
    perform public.research_fulfillment_onboard_supplier(
      '70000000-0000-4000-8000-000000000002',
      'Concurrent supplier',
      'Concurrent Supplier LLC',
      'live',
      'AGREEMENT-CONCURRENT',
      0,
      'supplier:concurrent:1',
      '2026-07-28T13:01:00.000Z'
    );
    raise exception 'cross-actor replay unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'cross-actor replay unexpectedly succeeded' then raise; end if;
  end;
  if (select count(*) from public.research_fulfillment_suppliers) <> 1
     or (select count(*) from public.research_fulfillment_events) <> 1 then
    raise exception 'cross-actor replay mutated fulfillment state';
  end if;
end;
$verify$;

truncate table public.research_supplier_fulfillment_orders cascade;
truncate table public.research_fulfillment_suppliers cascade;
delete from auth.users
 where id in (
   '70000000-0000-4000-8000-000000000001',
   '70000000-0000-4000-8000-000000000002'
 );

-- Product -> variant -> sorted-lot readiness serialization is exercised with
-- real concurrent sessions in both transaction orderings.
insert into auth.users(id, email) values
  ('71000000-0000-4000-8000-000000000001', 'race-operations@example.invalid');
insert into public.research_prelaunch_role_assignments(
  auth_user_id, role, assigned_by, reason, granted_at
) values (
  '71000000-0000-4000-8000-000000000001',
  'operations_admin',
  'disposable-verifier',
  'Fulfillment readiness race proof',
  '2026-07-28T15:00:00.000Z'
);
insert into public.research_products(id, sku, admin_status, active_state)
values (
  '72000000-0000-4000-8000-000000000001',
  'SKU-RACE',
  'approved',
  true
);
insert into public.research_product_variants(id, product_id, sku, status, active)
values (
  '72000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000001',
  'SKU-RACE',
  'approved',
  true
);
select set_config('xenios.inventory_command', 'allowed', false);
insert into public.research_inventory_lots(
  id, lot_id, sku, owner, disposition, quantity_available,
  expiry_date, retest_date, shelf_life_source, excursion, recalled,
  product_id, variant_id, storage_location, quantity_received,
  quantity_reserved, quantity_quarantined, quantity_damaged, version,
  created_at, updated_at
) values (
  '73000000-0000-4000-8000-000000000001',
  'LOT-RACE', 'SKU-RACE', 'xenios', 'available', 0,
  '2027-12-31', '2027-06-30', 'coa', 'none', false,
  '72000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002',
  'VERIFIED LOCATION', 2, 2, 0, 0, 2,
  '2026-07-28T15:00:00.000Z', '2026-07-28T15:00:00.000Z'
);
insert into public.research_inventory_movements(
  id, lot_id, movement_type, quantity, source_bucket,
  available_before, available_after, reserved_before, reserved_after,
  quarantined_before, quarantined_after, damaged_before, damaged_after,
  resulting_version, idempotency_key, command_hash, reason, actor_id, occurred_at
) values (
  '73000000-0000-4000-8000-000000000002',
  '73000000-0000-4000-8000-000000000001',
  'reserve', 2, 'available', 2, 0, 0, 2, 0, 0, 0, 0, 2,
  'race:reserved:1', repeat('e', 64), 'Concurrency fixture',
  '71000000-0000-4000-8000-000000000001',
  '2026-07-28T15:00:00.000Z'
);
select set_config('xenios.quality_command', 'allowed', false);
insert into public.research_lot_quality_documents(
  id, lot_id, coa_on_file, identity_confirmed, purity_confirmed,
  sterility_confirmed, endotoxin_confirmed, document_ref, recorded_at,
  document_state, verification_state, private_storage_key, reviewed_at,
  bucket_id, original_filename, content_type, size_bytes, sha256,
  report_issuer, report_number, report_date, reviewed_by,
  published_at, published_by, version
) values (
  '73000000-0000-4000-8000-000000000003',
  '73000000-0000-4000-8000-000000000001',
  true, true, true, true, true, 'private-reference',
  '2026-07-28T15:00:00.000Z', 'available', 'document_on_file',
  'lots/LOT-RACE/coa.pdf', '2026-07-28T15:00:00.000Z',
  'research-coa-production', 'coa.pdf', 'application/pdf', 1024, repeat('f', 64),
  'Verified laboratory', 'REPORT-RACE', '2026-07-20',
  '71000000-0000-4000-8000-000000000001',
  '2026-07-28T15:00:00.000Z',
  '71000000-0000-4000-8000-000000000001', 4
);
insert into public.research_lot_quality_tests(
  quality_document_id, test_key, state, method, result, reviewed_by, reviewed_at
)
select
  '73000000-0000-4000-8000-000000000003',
  test_key,
  case when test_key in ('identity','assay','purity','chain_of_custody')
    then 'passed' else 'not_applicable' end,
  case when test_key in ('identity','assay','purity','chain_of_custody')
    then 'verified-method' else null end,
  case when test_key in ('identity','assay','purity','chain_of_custody')
    then 'verified-result' else null end,
  case when test_key in ('identity','assay','purity','chain_of_custody')
    then '71000000-0000-4000-8000-000000000001'::uuid else null end,
  case when test_key in ('identity','assay','purity','chain_of_custody')
    then '2026-07-28T15:00:00.000Z'::timestamptz else null end
from unnest(array[
  'identity','assay','purity','sterility','endotoxin','particulate',
  'residual_solvents','elemental_impurities','chain_of_custody'
]) test_key;
select set_config('xenios.quality_command', '', false);
select set_config('xenios.inventory_command', '', false);
insert into public.research_lot_reservations(
  id, reservation_id, member_id, sku, quantity, status, expires_at,
  created_at, finalized_at, version, updated_at
) values (
  '74000000-0000-4000-8000-000000000001',
  'reservation:race:1',
  '74000000-0000-4000-8000-000000000002',
  'SKU-RACE', 1, 'finalized',
  '2026-07-28T17:00:00.000Z',
  '2026-07-28T15:00:00.000Z',
  '2026-07-28T15:01:00.000Z',
  2, '2026-07-28T15:01:00.000Z'
), (
  '74000000-0000-4000-8000-000000000004',
  'reservation:race:2',
  '74000000-0000-4000-8000-000000000002',
  'SKU-RACE', 1, 'finalized',
  '2026-07-28T17:00:00.000Z',
  '2026-07-28T15:00:00.000Z',
  '2026-07-28T15:01:00.000Z',
  2, '2026-07-28T15:01:00.000Z'
);
insert into public.research_lot_reservation_allocations(
  id, reservation_id, seq, lot_id, quantity, lot_uuid,
  movement_id, resulting_lot_version
) values (
  '74000000-0000-4000-8000-000000000003',
  '74000000-0000-4000-8000-000000000001',
  0, 'LOT-RACE', 1,
  '73000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000002', 2
), (
  '74000000-0000-4000-8000-000000000005',
  '74000000-0000-4000-8000-000000000004',
  0, 'LOT-RACE', 1,
  '73000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000002', 2
);
insert into public.research_fulfillment_suppliers(
  id, display_name, legal_name, state, provider_mode, agreement_reference,
  agreement_verified_at, version, created_by, created_at, updated_by, updated_at
) values (
  '75000000-0000-4000-8000-000000000001',
  'Race supplier', 'Race Supplier LLC', 'active', 'live', 'AGREEMENT-RACE',
  '2026-07-28T15:02:00.000Z', 1,
  '71000000-0000-4000-8000-000000000001',
  '2026-07-28T15:02:00.000Z',
  '71000000-0000-4000-8000-000000000001',
  '2026-07-28T15:02:00.000Z'
);
insert into public.research_supplier_offers(
  id, supplier_id, product_id, variant_id, sku, state, settlement_currency,
  settlement_amount_cents, agreement_reference, version,
  created_by, created_at, updated_by, updated_at
) values (
  '75000000-0000-4000-8000-000000000002',
  '75000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002',
  'SKU-RACE', 'active', 'USD', 2500, 'AGREEMENT-RACE', 1,
  '71000000-0000-4000-8000-000000000001',
  '2026-07-28T15:02:00.000Z',
  '71000000-0000-4000-8000-000000000001',
  '2026-07-28T15:02:00.000Z'
);
select set_config('xenios.paid_order_boundary', 'allowed', false);
insert into public.research_supplier_fulfillment_orders(
  id, order_id, member_id, reservation_id, state,
  recipient_name, address_line1, address_city, address_state,
  address_postal_code, address_country, shipping_service,
  handling_profile, version, created_at, updated_at
) values (
  '76000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000011',
  '74000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000001',
  'ready', 'Race Recipient', '10 Verification Way', 'Austin', 'TX',
  '78701', 'US', 'ground', 'ambient', 1,
  '2026-07-28T15:03:00.000Z', '2026-07-28T15:03:00.000Z'
), (
  '76000000-0000-4000-8000-000000000002',
  '76000000-0000-4000-8000-000000000012',
  '74000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000004',
  'ready', 'Race Recipient', '10 Verification Way', 'Austin', 'TX',
  '78701', 'US', 'ground', 'ambient', 1,
  '2026-07-28T15:03:00.000Z', '2026-07-28T15:03:00.000Z'
);
insert into public.research_supplier_fulfillment_lines(
  id, fulfillment_order_id, sku, quantity, reservation_id
) values (
  '76000000-0000-4000-8000-000000000003',
  '76000000-0000-4000-8000-000000000001',
  'SKU-RACE', 1, '74000000-0000-4000-8000-000000000001'
), (
  '76000000-0000-4000-8000-000000000004',
  '76000000-0000-4000-8000-000000000002',
  'SKU-RACE', 1, '74000000-0000-4000-8000-000000000004'
);
select set_config('xenios.paid_order_boundary', '', false);

select dblink_connect('race_invalidation', 'dbname=' || current_database());
select dblink_connect('race_assignment', 'dbname=' || current_database());

-- Invalidation acquires the exclusive product identity lock first. Assignment
-- waits, then fails its current readiness check after invalidation commits.
select dblink_exec('race_invalidation', 'begin');
select dblink_exec(
  'race_invalidation',
  $remote$
    update public.research_products
       set active_state = false
     where id = '72000000-0000-4000-8000-000000000001'
  $remote$
);
select dblink_send_query(
  'race_assignment',
  $remote$
    select public.research_fulfillment_assign(
      '71000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000002',
      '76000000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'fulfillmentLineId', '76000000-0000-4000-8000-000000000003',
        'reservationId', '74000000-0000-4000-8000-000000000001',
        'reservationAllocationId', '74000000-0000-4000-8000-000000000003'
      )),
      0, 'fulfillment:race:invalidation-first',
      '2026-07-28T15:04:00.000Z'
    )
  $remote$
);
select pg_sleep(0.2);
do $verify$
begin
  if dblink_is_busy('race_assignment') <> 1 then
    raise exception 'assignment did not serialize behind readiness invalidation';
  end if;
end;
$verify$;
select dblink_exec('race_invalidation', 'commit');
select * from dblink_get_result('race_assignment', false) as result(value jsonb);
select * from dblink_get_result('race_assignment', false) as result(value jsonb);
do $verify$
begin
  if exists (
    select 1 from public.research_fulfillment_assignments
     where fulfillment_order_id = '76000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'invalidation-first race left an unsafe assignment';
  end if;
end;
$verify$;

update public.research_products
   set active_state = true
 where id = '72000000-0000-4000-8000-000000000001';
select dblink_disconnect('race_invalidation');
select dblink_disconnect('race_assignment');
select dblink_connect('race_assignment', 'dbname=' || current_database());

-- Assignment owns shared product/variant plus exact lot locks first. A real
-- concurrent invalidation is rejected rather than committing stale evidence.
select dblink_exec('race_assignment', 'begin');
select dblink_exec(
  'race_assignment',
  $remote$
    do $command$
    begin
      perform public.research_fulfillment_assign(
        '71000000-0000-4000-8000-000000000001',
        '75000000-0000-4000-8000-000000000001',
        '75000000-0000-4000-8000-000000000002',
        '76000000-0000-4000-8000-000000000002',
        jsonb_build_array(jsonb_build_object(
          'fulfillmentLineId', '76000000-0000-4000-8000-000000000004',
          'reservationId', '74000000-0000-4000-8000-000000000004',
          'reservationAllocationId', '74000000-0000-4000-8000-000000000005'
        )),
        0, 'fulfillment:race:assignment-first',
        '2026-07-28T15:05:00.000Z'
      );
    end
    $command$
  $remote$
);
do $verify$
begin
  begin
    update public.research_products
       set active_state = false
     where id = '72000000-0000-4000-8000-000000000001';
    raise exception 'assignment-first readiness invalidation unexpectedly committed';
  exception when others then
    if sqlerrm = 'assignment-first readiness invalidation unexpectedly committed' then
      raise;
    end if;
  end;
  if not (select active_state from public.research_products
           where id = '72000000-0000-4000-8000-000000000001') then
    raise exception 'failed readiness invalidation changed the product';
  end if;
end;
$verify$;
select dblink_exec('race_assignment', 'commit');
do $verify$
begin
  if not exists (
    select 1 from public.research_fulfillment_assignments
     where fulfillment_order_id = '76000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'assignment-first race did not commit the valid ordering';
  end if;
end;
$verify$;

select dblink_disconnect('race_assignment');

truncate table public.research_supplier_fulfillment_orders cascade;
truncate table public.research_fulfillment_suppliers cascade;
truncate table public.research_products cascade;
delete from auth.users
 where id = '71000000-0000-4000-8000-000000000001';

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
      union all select count(*) from public.research_fulfillment_events
      union all select count(*) from public.research_supplier_settlements
    ) counts;
  if v_count <> 0 then
    raise exception 'concurrency cleanup left % residual rows', v_count;
  end if;
end;
$verify$;
