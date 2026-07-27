\set ON_ERROR_STOP on

create extension if not exists dblink;

-- Run after the disposable bootstrap and applying the candidate twice.

do $$
declare
  target text;
  service_table_grants integer;
  service_rpc_grants integer;
begin
  foreach target in array array[
    'research_lot_reservations',
    'research_lot_reservation_allocations',
    'research_inventory_reservation_events'
  ] loop
    if not exists (
      select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = target
         and c.relrowsecurity
         and c.relforcerowsecurity
    ) then
      raise exception 'RLS is not forced on %', target;
    end if;
    if exists (
      select 1
        from pg_policies
       where schemaname = 'public' and tablename = target
    ) then
      raise exception 'unexpected RLS policy exists on %', target;
    end if;
    if has_table_privilege('anon', 'public.' || target, 'select')
       or has_table_privilege('authenticated', 'public.' || target, 'select')
       or has_table_privilege('anon', 'public.' || target, 'insert')
       or has_table_privilege('authenticated', 'public.' || target, 'insert') then
      raise exception 'browser grant remains on %', target;
    end if;
  end loop;

  select count(*) into service_table_grants
    from information_schema.role_table_grants
   where grantee = 'service_role'
     and table_schema = 'public'
     and table_name in (
       'research_lot_reservations',
       'research_lot_reservation_allocations',
       'research_inventory_reservation_events'
     );
  if service_table_grants <> 3 then
    raise exception 'expected 3 SELECT-only service table grants, found %',
      service_table_grants;
  end if;
  if exists (
    select 1
      from information_schema.role_table_grants
     where grantee = 'service_role'
       and table_schema = 'public'
       and table_name in (
         'research_lot_reservations',
         'research_lot_reservation_allocations',
         'research_inventory_reservation_events'
       )
       and privilege_type <> 'SELECT'
  ) then
    raise exception 'service role retains direct reservation DML';
  end if;

  select count(*) into service_rpc_grants
    from (
      values
        ('public.research_reserve_inventory(uuid,uuid,jsonb,timestamp with time zone,timestamp with time zone,text)'),
        ('public.research_release_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)'),
        ('public.research_finalize_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)'),
        ('public.research_expire_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)')
    ) expected(signature)
   where has_function_privilege('service_role', signature, 'execute');
  if service_rpc_grants <> 4 then
    raise exception 'expected 4 reviewed reservation RPC grants, found %',
      service_rpc_grants;
  end if;
  if exists (
    select 1
      from (
        values
          ('anon'),
          ('authenticated')
      ) browser(role_name)
      cross join (
        values
          ('public.research_reserve_inventory(uuid,uuid,jsonb,timestamp with time zone,timestamp with time zone,text)'),
          ('public.research_release_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)'),
          ('public.research_finalize_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)'),
          ('public.research_expire_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)')
      ) command(signature)
     where has_function_privilege(browser.role_name, command.signature, 'execute')
  ) then
    raise exception 'browser role can execute a reservation command';
  end if;
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'research_reserve_inventory',
         'research_release_inventory_reservations',
         'research_finalize_inventory_reservations',
         'research_expire_inventory_reservations'
       )
       and coalesce(array_to_string(p.proconfig, ','), '') <>
         'search_path=pg_catalog'
  ) then
    raise exception 'reservation command lacks a fixed search path';
  end if;
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'research_inventory_readiness_serialization_guard'
       and p.prosecdef
       and coalesce(array_to_string(p.proconfig, ','), '') =
         'search_path=pg_catalog'
  ) then
    raise exception 'readiness serialization guard is not fixed-path security definer';
  end if;
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'research_inventory_lot_identity_serialization_guard'
       and p.prosecdef
       and coalesce(array_to_string(p.proconfig, ','), '') =
         'search_path=pg_catalog'
  ) then
    raise exception 'lot identity serialization guard is not fixed-path security definer';
  end if;
  if has_function_privilege(
       'service_role',
       'public.research_inventory_readiness_serialization_guard()',
       'execute'
     )
     or has_function_privilege(
       'anon',
       'public.research_inventory_readiness_serialization_guard()',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.research_inventory_readiness_serialization_guard()',
       'execute'
     )
     or has_function_privilege(
       'service_role',
       'public.research_inventory_lot_identity_serialization_guard()',
       'execute'
     )
     or has_function_privilege(
       'anon',
       'public.research_inventory_lot_identity_serialization_guard()',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.research_inventory_lot_identity_serialization_guard()',
       'execute'
     ) then
    raise exception 'readiness serialization guard is directly executable';
  end if;
  if (
    select count(*)
      from pg_trigger t
     where not t.tgisinternal
       and t.tgenabled = 'O'
       and t.tgname in (
         'research_reservation_quality_document_readiness_lock',
         'research_reservation_quality_document_readiness_validate',
         'research_reservation_quality_test_readiness_lock',
         'research_reservation_quality_test_readiness_validate',
         'research_reservation_product_readiness_lock',
         'research_reservation_product_readiness_validate',
         'research_reservation_variant_readiness_lock',
         'research_reservation_variant_readiness_validate',
         'research_inventory_lot_identity_serialization'
       )
  ) <> 9 then
    raise exception 'readiness serialization trigger boundary is incomplete';
  end if;
end;
$$;

-- The dormant direct store must be unusable by the production service role.
do $$
declare
  blocked boolean := false;
begin
  begin
    execute 'set local role service_role';
    insert into public.research_lot_reservations(
      reservation_id, member_id, sku, quantity, status, expires_at
    ) values (
      '00000000-0000-4000-8000-000000009999',
      '00000000-0000-4000-8000-000000000001',
      'BYPASS-SKU',
      999,
      'held',
      '2026-07-28T00:00:00.000Z'
    );
  exception when insufficient_privilege then
    blocked := true;
  end;
  execute 'reset role';
  if not blocked then
    raise exception 'service-role direct reservation insert was not denied';
  end if;
end;
$$;

insert into public.research_products(id, sku, admin_status, active_state)
values
  ('20000000-0000-4000-8000-000000000001', 'PRODUCT-A', 'approved', true),
  ('20000000-0000-4000-8000-000000000002', 'PRODUCT-B', 'approved', true),
  ('20000000-0000-4000-8000-000000000003', 'PRODUCT-DRAFT', 'draft', true),
  ('20000000-0000-4000-8000-000000000004', 'PRODUCT-C', 'approved', true),
  ('20000000-0000-4000-8000-000000000005', 'PRODUCT-D', 'approved', true),
  ('20000000-0000-4000-8000-000000000006', 'PRODUCT-E', 'approved', true),
  ('20000000-0000-4000-8000-000000000007', 'PRODUCT-F', 'approved', true),
  ('20000000-0000-4000-8000-000000000008', 'PRODUCT-G', 'approved', true),
  ('20000000-0000-4000-8000-000000000009', 'PRODUCT-H', 'approved', true),
  ('20000000-0000-4000-8000-000000000010', 'PRODUCT-I', 'approved', true),
  ('20000000-0000-4000-8000-000000000011', 'PRODUCT-J', 'approved', true),
  ('20000000-0000-4000-8000-000000000012', 'PRODUCT-K', 'approved', true);

insert into public.research_product_variants(id, product_id, sku, status, active)
values
  (
    '21000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'SKU-A',
    'approved',
    true
  ),
  (
    '21000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    'SKU-B',
    'approved',
    true
  ),
  (
    '21000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000003',
    'SKU-DRAFT',
    'draft',
    false
  ),
  (
    '21000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000004',
    'SKU-C',
    'approved',
    true
  ),
  (
    '21000000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000005',
    'SKU-D',
    'approved',
    true
  ),
  (
    '21000000-0000-4000-8000-000000000006',
    '20000000-0000-4000-8000-000000000006',
    'SKU-E',
    'approved',
    true
  ),
  (
    '21000000-0000-4000-8000-000000000007',
    '20000000-0000-4000-8000-000000000007',
    'SKU-F',
    'approved',
    true
  ),
  (
    '21000000-0000-4000-8000-000000000008',
    '20000000-0000-4000-8000-000000000008',
    'SKU-G',
    'approved',
    true
  ),
  (
    '21000000-0000-4000-8000-000000000009',
    '20000000-0000-4000-8000-000000000009',
    'SKU-H',
    'approved',
    true
  ),
  (
    '21000000-0000-4000-8000-000000000010',
    '20000000-0000-4000-8000-000000000010',
    'SKU-I',
    'approved',
    true
  ),
  (
    '21000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    'SKU-J',
    'approved',
    true
  ),
  (
    '21000000-0000-4000-8000-000000000012',
    '20000000-0000-4000-8000-000000000012',
    'SKU-K',
    'approved',
    true
  );

create or replace function public.research_verifier_seed_ready_lot(
  p_lot_code text,
  p_sku text,
  p_product uuid,
  p_variant uuid,
  p_quantity integer,
  p_expiry date
)
returns uuid
language plpgsql
set search_path = pg_catalog
as $$
declare
  created jsonb;
  lot_uuid uuid;
  document_uuid uuid := gen_random_uuid();
  test_key text;
begin
  created := public.research_create_inventory_lot(
    p_lot_code,
    p_sku,
    p_product,
    p_variant,
    'xenios',
    'RESERVATION-VERIFY',
    'VERIFIED-SUPPLIER',
    null,
    p_expiry,
    null,
    'supplier_document',
    'create-' || lower(p_lot_code) || '-0001',
    '00000000-0000-4000-8000-000000000002',
    '2026-07-27T17:00:00.000Z'
  );
  lot_uuid := (created->>'lotId')::uuid;
  perform public.research_apply_inventory_movement(
    lot_uuid,
    'receipt',
    p_quantity,
    null,
    1,
    'receipt-' || lower(p_lot_code) || '-0001',
    'Verified receipt',
    '00000000-0000-4000-8000-000000000002',
    '2026-07-27T17:01:00.000Z'
  );

  perform set_config('xenios.quality_command', 'allowed', true);
  insert into public.research_lot_quality_documents(
    id,
    lot_id,
    coa_on_file,
    identity_confirmed,
    purity_confirmed,
    sterility_confirmed,
    endotoxin_confirmed,
    document_state,
    verification_state,
    private_storage_key,
    bucket_id,
    original_filename,
    content_type,
    size_bytes,
    sha256,
    report_issuer,
    report_number,
    report_date,
    reviewed_at,
    reviewed_by,
    published_at,
    published_by,
    version
  ) values (
    document_uuid,
    lot_uuid,
    true,
    true,
    true,
    true,
    true,
    'available',
    'document_on_file',
    'lots/' || lot_uuid::text || '/verified.pdf',
    'research-coa-production',
    'verified.pdf',
    'application/pdf',
    100,
    repeat('a', 64),
    'Verified Laboratory',
    'REPORT-' || p_lot_code,
    '2026-07-26',
    '2026-07-27T17:02:00.000Z',
    '00000000-0000-4000-8000-000000000002',
    '2026-07-27T17:03:00.000Z',
    '00000000-0000-4000-8000-000000000002',
    4
  );
  foreach test_key in array array[
    'identity', 'assay', 'purity', 'sterility', 'endotoxin',
    'particulate', 'residual_solvents', 'elemental_impurities',
    'chain_of_custody'
  ] loop
    insert into public.research_lot_quality_tests(
      quality_document_id,
      test_key,
      state,
      method,
      result,
      unit,
      reviewed_by,
      reviewed_at
    ) values (
      document_uuid,
      test_key,
      'passed',
      'verified-method',
      'passed',
      null,
      '00000000-0000-4000-8000-000000000002',
      '2026-07-27T17:02:00.000Z'
    );
  end loop;
  perform public.research_apply_inventory_movement(
    lot_uuid,
    'quarantine_release',
    p_quantity,
    'quarantined',
    2,
    'release-' || lower(p_lot_code) || '-0001',
    'Verified lot release',
    '00000000-0000-4000-8000-000000000002',
    '2026-07-27T17:04:00.000Z'
  );
  perform public.research_set_inventory_lot_disposition(
    lot_uuid,
    'available',
    3,
    'status-' || lower(p_lot_code) || '-0001',
    'Verified lot available',
    '00000000-0000-4000-8000-000000000002',
    '2026-07-27T17:05:00.000Z'
  );
  return lot_uuid;
end;
$$;

select public.research_verifier_seed_ready_lot(
  'LOT-A-EARLY',
  'SKU-A',
  '20000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  3,
  '2026-08-15'
);
select public.research_verifier_seed_ready_lot(
  'LOT-A-LATE',
  'SKU-A',
  '20000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  5,
  '2026-09-15'
);
select public.research_verifier_seed_ready_lot(
  'LOT-B',
  'SKU-B',
  '20000000-0000-4000-8000-000000000002',
  '21000000-0000-4000-8000-000000000002',
  4,
  '2026-10-15'
);
select public.research_verifier_seed_ready_lot(
  'LOT-C-CONCURRENT-REPLAY',
  'SKU-C',
  '20000000-0000-4000-8000-000000000004',
  '21000000-0000-4000-8000-000000000004',
  5,
  '2026-10-20'
);
select public.research_verifier_seed_ready_lot(
  'LOT-D-CONCURRENT-DEMAND',
  'SKU-D',
  '20000000-0000-4000-8000-000000000005',
  '21000000-0000-4000-8000-000000000005',
  5,
  '2026-10-21'
);
select public.research_verifier_seed_ready_lot(
  'LOT-E-HORIZON',
  'SKU-E',
  '20000000-0000-4000-8000-000000000006',
  '21000000-0000-4000-8000-000000000006',
  2,
  '2026-08-01'
);
select public.research_verifier_seed_ready_lot(
  'LOT-F-RESERVE-FIRST',
  'SKU-F',
  '20000000-0000-4000-8000-000000000007',
  '21000000-0000-4000-8000-000000000007',
  2,
  '2026-12-01'
);
select public.research_verifier_seed_ready_lot(
  'LOT-G-WITHDRAW-FIRST',
  'SKU-G',
  '20000000-0000-4000-8000-000000000008',
  '21000000-0000-4000-8000-000000000008',
  2,
  '2026-12-01'
);

-- Stable product/variant identity locks close the zero-lot phantom. Exercise
-- both orderings for both identity levels with lot creation and reservation in
-- the same transaction.
create or replace function public.research_verifier_seed_and_reserve(
  p_lot_code text,
  p_sku text,
  p_product uuid,
  p_variant uuid,
  p_key text
)
returns jsonb
language plpgsql
set search_path = pg_catalog
as $$
declare
  lot_uuid uuid;
  reserved jsonb;
begin
  lot_uuid := public.research_verifier_seed_ready_lot(
    p_lot_code,
    p_sku,
    p_product,
    p_variant,
    2,
    '2026-12-15'
  );
  reserved := public.research_reserve_inventory(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    jsonb_build_array(jsonb_build_object('sku', p_sku, 'quantity', 1)),
    '2026-07-27T17:30:00.000Z',
    '2026-07-27T18:30:00.000Z',
    p_key
  );
  return jsonb_build_object('ok', true, 'result', reserved);
exception when others then
  return jsonb_build_object('ok', false, 'message', sqlerrm);
end;
$$;

create or replace function public.research_verifier_invalidate_identity(
  p_kind text,
  p_identity uuid
)
returns jsonb
language plpgsql
set search_path = pg_catalog
as $$
begin
  if p_kind = 'product' then
    update public.research_products
       set admin_status = 'archived', active_state = false
     where id = p_identity;
  elsif p_kind = 'variant' then
    update public.research_product_variants
       set status = 'archived', active = false
     where id = p_identity;
  else
    raise exception 'unsupported verifier identity';
  end if;
  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('ok', false, 'message', sqlerrm);
end;
$$;

-- Invalidation-first with zero lots: the later lot/create reservation waits
-- for the stable identity lock and then fails against current readiness.
select dblink_connect('phantom_product_invalidate_first', 'dbname=' || current_database());
select dblink_connect('phantom_product_reserve_second', 'dbname=' || current_database());
select dblink_exec('phantom_product_invalidate_first', 'begin');
select *
  from dblink(
    'phantom_product_invalidate_first',
    $q$
      select public.research_verifier_invalidate_identity(
        'product',
        '20000000-0000-4000-8000-000000000009'
      )::text
    $q$
  ) as invalidated(result text);
select dblink_send_query(
  'phantom_product_reserve_second',
  $q$
    select public.research_verifier_seed_and_reserve(
      'LOT-H-PRODUCT-INVALID-FIRST',
      'SKU-H',
      '20000000-0000-4000-8000-000000000009',
      '21000000-0000-4000-8000-000000000009',
      'phantom-product-invalidation-first-0001'
    )::text
  $q$
);
select pg_sleep(0.1);
do $$
begin
  if dblink_is_busy('phantom_product_reserve_second') <> 1 then
    raise exception 'product invalidation-first reserve did not serialize';
  end if;
end;
$$;
select dblink_exec('phantom_product_invalidate_first', 'commit');
do $$
declare
  reserved jsonb;
begin
  select result::jsonb into reserved
    from dblink_get_result('phantom_product_reserve_second') as completed(result text);
  if reserved->>'ok' <> 'false'
     or exists (select 1 from public.research_inventory_lots where sku = 'SKU-H')
     or exists (select 1 from public.research_lot_reservations where sku = 'SKU-H')
     or not exists (
       select 1 from public.research_products
        where id = '20000000-0000-4000-8000-000000000009'
          and admin_status = 'archived'
          and not active_state
     ) then
    raise exception 'product invalidation-first phantom was not closed';
  end if;
end;
$$;
select dblink_disconnect('phantom_product_invalidate_first');
select dblink_disconnect('phantom_product_reserve_second');

select dblink_connect('phantom_variant_invalidate_first', 'dbname=' || current_database());
select dblink_connect('phantom_variant_reserve_second', 'dbname=' || current_database());
select dblink_exec('phantom_variant_invalidate_first', 'begin');
select *
  from dblink(
    'phantom_variant_invalidate_first',
    $q$
      select public.research_verifier_invalidate_identity(
        'variant',
        '21000000-0000-4000-8000-000000000011'
      )::text
    $q$
  ) as invalidated(result text);
select dblink_send_query(
  'phantom_variant_reserve_second',
  $q$
    select public.research_verifier_seed_and_reserve(
      'LOT-J-VARIANT-INVALID-FIRST',
      'SKU-J',
      '20000000-0000-4000-8000-000000000011',
      '21000000-0000-4000-8000-000000000011',
      'phantom-variant-invalidation-first-0001'
    )::text
  $q$
);
select pg_sleep(0.1);
do $$
begin
  if dblink_is_busy('phantom_variant_reserve_second') <> 1 then
    raise exception 'variant invalidation-first reserve did not serialize';
  end if;
end;
$$;
select dblink_exec('phantom_variant_invalidate_first', 'commit');
do $$
declare
  reserved jsonb;
begin
  select result::jsonb into reserved
    from dblink_get_result('phantom_variant_reserve_second') as completed(result text);
  if reserved->>'ok' <> 'false'
     or exists (select 1 from public.research_inventory_lots where sku = 'SKU-J')
     or exists (select 1 from public.research_lot_reservations where sku = 'SKU-J')
     or not exists (
       select 1 from public.research_product_variants
        where id = '21000000-0000-4000-8000-000000000011'
          and status = 'archived'
          and not active
     ) then
    raise exception 'variant invalidation-first phantom was not closed';
  end if;
end;
$$;
select dblink_disconnect('phantom_variant_invalidate_first');
select dblink_disconnect('phantom_variant_reserve_second');

-- Create/reserve-first with zero initial lots: the transaction keeps shared
-- identity locks, so a concurrent invalidation fails rather than waiting with
-- a stale statement snapshot.
select dblink_connect('phantom_product_reserve_first', 'dbname=' || current_database());
select dblink_connect('phantom_product_invalidate_second', 'dbname=' || current_database());
select dblink_exec('phantom_product_reserve_first', 'begin');
select *
  from dblink(
    'phantom_product_reserve_first',
    $q$
      select public.research_verifier_seed_and_reserve(
        'LOT-I-PRODUCT-RESERVE-FIRST',
        'SKU-I',
        '20000000-0000-4000-8000-000000000010',
        '21000000-0000-4000-8000-000000000010',
        'phantom-product-reserve-first-0001'
      )::text
    $q$
  ) as reserved(result text);
select *
  from dblink(
    'phantom_product_invalidate_second',
    $q$
      select public.research_verifier_invalidate_identity(
        'product',
        '20000000-0000-4000-8000-000000000010'
      )::text
    $q$
  ) as invalidated(result text);
select dblink_exec('phantom_product_reserve_first', 'commit');
do $$
begin
  if not exists (
       select 1 from public.research_lot_reservations
        where sku = 'SKU-I' and status = 'held'
     )
     or not exists (
       select 1 from public.research_products
        where id = '20000000-0000-4000-8000-000000000010'
          and admin_status = 'approved'
          and active_state
     ) then
    raise exception 'product reserve-first phantom ordering was unsafe';
  end if;
end;
$$;
select dblink_disconnect('phantom_product_reserve_first');
select dblink_disconnect('phantom_product_invalidate_second');

select dblink_connect('phantom_variant_reserve_first', 'dbname=' || current_database());
select dblink_connect('phantom_variant_invalidate_second', 'dbname=' || current_database());
select dblink_exec('phantom_variant_reserve_first', 'begin');
select *
  from dblink(
    'phantom_variant_reserve_first',
    $q$
      select public.research_verifier_seed_and_reserve(
        'LOT-K-VARIANT-RESERVE-FIRST',
        'SKU-K',
        '20000000-0000-4000-8000-000000000012',
        '21000000-0000-4000-8000-000000000012',
        'phantom-variant-reserve-first-0001'
      )::text
    $q$
  ) as reserved(result text);
select *
  from dblink(
    'phantom_variant_invalidate_second',
    $q$
      select public.research_verifier_invalidate_identity(
        'variant',
        '21000000-0000-4000-8000-000000000012'
      )::text
    $q$
  ) as invalidated(result text);
select dblink_exec('phantom_variant_reserve_first', 'commit');
do $$
declare
  product_hold_ids text[];
  variant_hold_ids text[];
begin
  if not exists (
       select 1 from public.research_lot_reservations
        where sku = 'SKU-K' and status = 'held'
     )
     or not exists (
       select 1 from public.research_product_variants
        where id = '21000000-0000-4000-8000-000000000012'
          and status = 'approved'
          and active
     ) then
    raise exception 'variant reserve-first phantom ordering was unsafe';
  end if;
  select array_agg(reservation_id) into product_hold_ids
    from public.research_lot_reservations
   where sku = 'SKU-I' and status = 'held';
  select array_agg(reservation_id) into variant_hold_ids
    from public.research_lot_reservations
   where sku = 'SKU-K' and status = 'held';
  perform public.research_release_inventory_reservations(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    product_hold_ids,
    '2026-07-27T17:40:00.000Z',
    'cleanup-product-reserve-first-0001',
    'Verifier phantom fixture cleanup'
  );
  perform public.research_release_inventory_reservations(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    variant_hold_ids,
    '2026-07-27T17:40:00.000Z',
    'cleanup-variant-reserve-first-0001',
    'Verifier phantom fixture cleanup'
  );
end;
$$;
select dblink_disconnect('phantom_variant_reserve_first');
select dblink_disconnect('phantom_variant_invalidate_second');
drop function public.research_verifier_invalidate_identity(text, uuid);
drop function public.research_verifier_seed_and_reserve(text, text, uuid, uuid, text);
drop function public.research_verifier_seed_ready_lot(text, text, uuid, uuid, integer, date);

-- Holds cannot extend beyond an allocated lot's exact usable horizon, and
-- finalize revalidates the exact current lot/readiness chain.
do $$
declare
  before_counts jsonb;
  after_counts jsonb;
  held jsonb;
  held_ids text[];
  lot_uuid uuid;
  denied boolean;
begin
  select jsonb_build_object(
    'headers', (select count(*) from public.research_lot_reservations),
    'allocations', (select count(*) from public.research_lot_reservation_allocations),
    'movements', (select count(*) from public.research_inventory_movements),
    'events', (select count(*) from public.research_inventory_reservation_events)
  ) into before_counts;
  denied := false;
  begin
    perform public.research_reserve_inventory(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '[{"sku":"SKU-E","quantity":1}]'::jsonb,
      '2026-07-27T17:20:00.000Z',
      '2026-08-02T00:00:00.000Z',
      'deny-hold-beyond-lot-horizon-0001'
    );
  exception when others then
    denied := sqlerrm like '%command rejected%';
  end;
  select jsonb_build_object(
    'headers', (select count(*) from public.research_lot_reservations),
    'allocations', (select count(*) from public.research_lot_reservation_allocations),
    'movements', (select count(*) from public.research_inventory_movements),
    'events', (select count(*) from public.research_inventory_reservation_events)
  ) into after_counts;
  if not denied or after_counts <> before_counts then
    raise exception 'hold beyond exact lot horizon did not fail without mutation';
  end if;

  held := public.research_reserve_inventory(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '[{"sku":"SKU-E","quantity":1}]'::jsonb,
    '2026-07-27T17:21:00.000Z',
    '2026-07-28T00:00:00.000Z',
    'reserve-finalize-readiness-recheck-0001'
  );
  select array_agg(value->>'reservationId')
    into held_ids
    from jsonb_array_elements(held->'reservations');
  select id into lot_uuid
    from public.research_inventory_lots
   where lot_id = 'LOT-E-HORIZON';
  update public.research_inventory_lots
     set recalled = true
   where id = lot_uuid;

  select jsonb_build_object(
    'header', (select to_jsonb(r) from public.research_lot_reservations r
      where r.reservation_id = held_ids[1]),
    'lot', (select to_jsonb(l) from public.research_inventory_lots l where l.id = lot_uuid),
    'movements', (select count(*) from public.research_inventory_movements),
    'events', (select count(*) from public.research_inventory_reservation_events)
  ) into before_counts;
  denied := false;
  begin
    perform public.research_finalize_inventory_reservations(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      held_ids,
      '2026-07-27T17:22:00.000Z',
      'deny-finalize-recalled-lot-0001',
      'Settlement must revalidate readiness'
    );
  exception when others then
    denied := sqlerrm like '%command rejected%';
  end;
  select jsonb_build_object(
    'header', (select to_jsonb(r) from public.research_lot_reservations r
      where r.reservation_id = held_ids[1]),
    'lot', (select to_jsonb(l) from public.research_inventory_lots l where l.id = lot_uuid),
    'movements', (select count(*) from public.research_inventory_movements),
    'events', (select count(*) from public.research_inventory_reservation_events)
  ) into after_counts;
  if not denied or after_counts <> before_counts then
    raise exception 'finalize accepted an invalid exact lot chain or mutated on rejection';
  end if;

  perform public.research_release_inventory_reservations(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    held_ids,
    '2026-07-27T17:23:00.000Z',
    'release-invalid-finalize-fixture-0001',
    'Safety exit after readiness invalidation'
  );
end;
$$;

-- The same per-lot lock is used by reserve and canonical COA invalidation.
-- Both race orderings are safe: reserve-first preserves valid evidence and
-- rejects withdrawal while held; withdrawal-first commits and reserve fails.
create or replace function public.research_verifier_try_withdraw(
  p_lot_code text,
  p_key text
)
returns jsonb
language plpgsql
set search_path = pg_catalog
as $$
declare
  document_uuid uuid;
begin
  select d.id into document_uuid
    from public.research_lot_quality_documents d
    join public.research_inventory_lots l on l.id = d.lot_id
   where l.lot_id = p_lot_code
     and d.superseded_at is null;
  return jsonb_build_object(
    'ok', true,
    'result', public.research_manage_lot_quality_document(
      document_uuid,
      'withdraw',
      '[]'::jsonb,
      4,
      p_key,
      'Verifier concurrent withdrawal',
      '00000000-0000-4000-8000-000000000002',
      '2026-07-27T17:26:00.000Z'
    )
  );
exception when others then
  return jsonb_build_object('ok', false, 'message', sqlerrm);
end;
$$;

create or replace function public.research_verifier_try_reserve(
  p_sku text,
  p_key text
)
returns jsonb
language plpgsql
set search_path = pg_catalog
as $$
begin
  return jsonb_build_object(
    'ok', true,
    'result', public.research_reserve_inventory(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      jsonb_build_array(jsonb_build_object('sku', p_sku, 'quantity', 1)),
      '2026-07-27T17:25:00.000Z',
      '2026-07-27T18:00:00.000Z',
      p_key
    )
  );
exception when others then
  return jsonb_build_object('ok', false, 'message', sqlerrm);
end;
$$;

select dblink_connect('readiness_reserve_first', 'dbname=' || current_database());
select dblink_connect('readiness_withdraw_second', 'dbname=' || current_database());
select dblink_exec('readiness_reserve_first', 'begin');
select *
  from dblink(
    'readiness_reserve_first',
    $q$
      select pg_advisory_xact_lock(hashtextextended(
        'xenios:inventory-readiness:v1|' || (
          select id::text from public.research_inventory_lots
           where lot_id = 'LOT-F-RESERVE-FIRST'
        ),
        0
      ))::text
    $q$
  ) as locked(result text);
select dblink_send_query(
  'readiness_withdraw_second',
  $q$
    select public.research_verifier_try_withdraw(
      'LOT-F-RESERVE-FIRST',
      'withdraw-reserve-first-0001'
    )::text
  $q$
);
select *
  from dblink(
    'readiness_reserve_first',
    $q$
      select public.research_verifier_try_reserve(
        'SKU-F',
        'reserve-before-withdraw-0001'
      )::text
    $q$
  ) as reserved(result text);
select dblink_exec('readiness_reserve_first', 'commit');
do $$
declare
  withdrawal jsonb;
  held_ids text[];
begin
  select result::jsonb into withdrawal
    from dblink_get_result('readiness_withdraw_second') as completed(result text);
  if withdrawal->>'ok' <> 'false'
     or exists (
       select 1
         from public.research_lot_quality_documents d
         join public.research_inventory_lots l on l.id = d.lot_id
        where l.lot_id = 'LOT-F-RESERVE-FIRST'
          and (
            d.document_state <> 'available'
            or d.verification_state <> 'document_on_file'
          )
     )
     or (select count(*) from public.research_lot_reservations
          where sku = 'SKU-F' and status = 'held') <> 1 then
    raise exception 'reserve-first readiness race left unsafe durable state';
  end if;
  select array_agg(reservation_id) into held_ids
    from public.research_lot_reservations
   where sku = 'SKU-F' and status = 'held';
  perform public.research_release_inventory_reservations(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    held_ids,
    '2026-07-27T17:27:00.000Z',
    'release-readiness-race-fixture-0001',
    'Verifier race fixture cleanup'
  );
end;
$$;
select dblink_disconnect('readiness_reserve_first');
select dblink_disconnect('readiness_withdraw_second');

select dblink_connect('readiness_withdraw_first', 'dbname=' || current_database());
select dblink_connect('readiness_reserve_second', 'dbname=' || current_database());
select dblink_exec('readiness_withdraw_first', 'begin');
select *
  from dblink(
    'readiness_withdraw_first',
    $q$
      select public.research_verifier_try_withdraw(
        'LOT-G-WITHDRAW-FIRST',
        'withdraw-before-reserve-0001'
      )::text
    $q$
  ) as withdrawn(result text);
select dblink_send_query(
  'readiness_reserve_second',
  $q$
    select public.research_verifier_try_reserve(
      'SKU-G',
      'reserve-after-withdraw-0001'
    )::text
  $q$
);
select dblink_exec('readiness_withdraw_first', 'commit');
do $$
declare
  reservation jsonb;
begin
  select result::jsonb into reservation
    from dblink_get_result('readiness_reserve_second') as completed(result text);
  if reservation->>'ok' <> 'false'
     or (select count(*) from public.research_lot_reservations where sku = 'SKU-G') <> 0
     or not exists (
       select 1
         from public.research_lot_quality_documents d
         join public.research_inventory_lots l on l.id = d.lot_id
        where l.lot_id = 'LOT-G-WITHDRAW-FIRST'
          and d.document_state = 'withdrawn'
          and d.verification_state = 'withdrawn'
     ) then
    raise exception 'withdrawal-first readiness race left unsafe durable state';
  end if;
end;
$$;
select dblink_disconnect('readiness_withdraw_first');
select dblink_disconnect('readiness_reserve_second');
drop function public.research_verifier_try_withdraw(text, text);
drop function public.research_verifier_try_reserve(text, text);

-- Concurrent identical commands serialize on the hashed command identity and
-- return one durable mutation/result.
select dblink_connect('reservation_replay_a', 'dbname=' || current_database());
select dblink_connect('reservation_replay_b', 'dbname=' || current_database());
select dblink_exec('reservation_replay_a', 'begin');
select *
  from dblink(
    'reservation_replay_a',
    $q$
      select pg_advisory_xact_lock(hashtextextended(
        encode(extensions.digest(
          concat_ws('|',
            'xenios:inventory-reservation:reserve:v1',
            'reserve-concurrent-replay-0001'
          ),
          'sha256'
        ), 'hex'),
        0
      ))::text
    $q$
  ) as locked(result text);
select dblink_send_query(
  'reservation_replay_b',
  $q$
    select public.research_reserve_inventory(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '[{"sku":"SKU-C","quantity":2}]'::jsonb,
      '2026-07-27T17:30:00.000Z',
      '2026-07-27T18:00:00.000Z',
      'reserve-concurrent-replay-0001'
    )::text
  $q$
);
select *
  from dblink(
    'reservation_replay_a',
    $q$
      select public.research_reserve_inventory(
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        '[{"sku":"SKU-C","quantity":2}]'::jsonb,
        '2026-07-27T17:30:00.000Z',
        '2026-07-27T18:00:00.000Z',
        'reserve-concurrent-replay-0001'
      )::text
    $q$
  ) as applied(result text);
select dblink_exec('reservation_replay_a', 'commit');
do $$
declare
  replay jsonb;
begin
  select result::jsonb into replay
    from dblink_get_result('reservation_replay_b') as completed(result text);
  if replay->>'idempotentReplay' <> 'true' then
    raise exception 'concurrent identical reserve did not replay';
  end if;
  if (select count(*) from public.research_lot_reservations where sku = 'SKU-C') <> 1
     or (
       select count(*)
         from public.research_inventory_movements m
         join public.research_inventory_lots l on l.id = m.lot_id
        where l.sku = 'SKU-C' and m.movement_type = 'reserve'
     ) <> 1
     or (
       select count(*) from public.research_inventory_reservation_events
        where action = 'reserve'
          and reservation_ids && array(
            select reservation_id from public.research_lot_reservations where sku = 'SKU-C'
          )
     ) <> 1 then
    raise exception 'concurrent identical reserve duplicated durable state';
  end if;
end;
$$;
select dblink_disconnect('reservation_replay_a');
select dblink_disconnect('reservation_replay_b');

-- A disposable catch wrapper lets the second concurrent command report its
-- expected fail-closed outcome without aborting the verifier connection.
create or replace function public.research_verifier_try_sku_d_reserve(
  p_key text
)
returns jsonb
language plpgsql
set search_path = pg_catalog
as $$
begin
  return jsonb_build_object(
    'ok', true,
    'result', public.research_reserve_inventory(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '[{"sku":"SKU-D","quantity":4}]'::jsonb,
      '2026-07-27T17:31:00.000Z',
      '2026-07-27T18:01:00.000Z',
      p_key
    )
  );
exception when others then
  return jsonb_build_object('ok', false);
end;
$$;

select dblink_connect('reservation_demand_a', 'dbname=' || current_database());
select dblink_connect('reservation_demand_b', 'dbname=' || current_database());
select dblink_exec('reservation_demand_a', 'begin');
select *
  from dblink(
    'reservation_demand_a',
    $q$
      select id::text
        from public.research_inventory_lots
       where lot_id = 'LOT-D-CONCURRENT-DEMAND'
       for update
    $q$
  ) as locked(result text);
select dblink_send_query(
  'reservation_demand_b',
  $q$
    select public.research_verifier_try_sku_d_reserve(
      'reserve-concurrent-demand-b-0001'
    )::text
  $q$
);
select *
  from dblink(
    'reservation_demand_a',
    $q$
      select public.research_verifier_try_sku_d_reserve(
        'reserve-concurrent-demand-a-0001'
      )::text
    $q$
  ) as applied(result text);
select dblink_exec('reservation_demand_a', 'commit');
do $$
declare
  second_result jsonb;
begin
  select result::jsonb into second_result
    from dblink_get_result('reservation_demand_b') as completed(result text);
  if second_result->>'ok' <> 'false' then
    raise exception 'concurrent same-lot demand oversold inventory';
  end if;
  if (
    select (quantity_available, quantity_reserved)
      from public.research_inventory_lots
     where lot_id = 'LOT-D-CONCURRENT-DEMAND'
  ) <> row(1, 4)
     or (select count(*) from public.research_lot_reservations where sku = 'SKU-D') <> 1 then
    raise exception 'concurrent same-lot demand did not leave one exact hold';
  end if;
end;
$$;
select dblink_disconnect('reservation_demand_a');
select dblink_disconnect('reservation_demand_b');
drop function public.research_verifier_try_sku_d_reserve(text);

-- Deterministic FEFO, duplicate-SKU consolidation, multi-SKU atomicity, and
-- sequential replay.
do $$
declare
  first_result jsonb;
  replay_result jsonb;
  reservation_count integer;
  movement_count integer;
  before_counts jsonb;
  after_counts jsonb;
  denied boolean;
begin
  first_result := public.research_reserve_inventory(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '[
      {"sku":"SKU-A","quantity":2},
      {"sku":"SKU-A","quantity":4},
      {"sku":"SKU-B","quantity":2}
    ]'::jsonb,
    '2026-07-27T18:00:00.000Z',
    '2026-07-27T18:30:00.000Z',
    'reserve-fefo-multisku-0001'
  );
  if first_result->>'action' <> 'reserve'
     or first_result->>'idempotentReplay' <> 'false'
     or jsonb_array_length(first_result->'reservations') <> 2 then
    raise exception 'reserve result shape is incorrect';
  end if;
  if (
    select sum((allocation->>'quantity')::integer)
    from jsonb_array_elements(first_result->'reservations') reservation
    cross join jsonb_array_elements(reservation->'allocations') allocation
    where reservation->>'sku' = 'SKU-A'
      and allocation->>'lotId' = (
        select id::text from public.research_inventory_lots
         where lot_id = 'LOT-A-EARLY'
      )
  ) <> 3 then
    raise exception 'FEFO did not consume the earliest lot first';
  end if;

  select count(*) into reservation_count
    from public.research_lot_reservations
   where sku in ('SKU-A', 'SKU-B');
  select count(*) into movement_count
    from public.research_inventory_movements movement
    join public.research_inventory_lots lot on lot.id = movement.lot_id
   where movement.reason = 'Atomic inventory reservation hold'
     and lot.sku in ('SKU-A', 'SKU-B');
  if reservation_count <> 2 or movement_count <> 3 then
    raise exception 'reserve did not create exact headers/movements';
  end if;

  replay_result := public.research_reserve_inventory(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '[
      {"sku":"SKU-A","quantity":2},
      {"sku":"SKU-A","quantity":4},
      {"sku":"SKU-B","quantity":2}
    ]'::jsonb,
    '2026-07-27T18:00:00.000Z',
    '2026-07-27T18:30:00.000Z',
    'reserve-fefo-multisku-0001'
  );
  if replay_result->>'idempotentReplay' <> 'true'
     or replay_result->'reservations' <> first_result->'reservations'
     or (
       select count(*) from public.research_lot_reservations
        where sku in ('SKU-A', 'SKU-B')
     ) <> reservation_count
     or (
       select count(*)
         from public.research_inventory_movements movement
         join public.research_inventory_lots lot on lot.id = movement.lot_id
        where movement.reason = 'Atomic inventory reservation hold'
          and lot.sku in ('SKU-A', 'SKU-B')
     ) <> movement_count then
    raise exception 'sequential reserve replay mutated state';
  end if;

  select jsonb_build_object(
    'reservations', (select count(*) from public.research_lot_reservations),
    'movements', (select count(*) from public.research_inventory_movements),
    'events', (select count(*) from public.research_inventory_reservation_events)
  ) into before_counts;
  denied := false;
  begin
    perform public.research_reserve_inventory(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '[{"sku":"SKU-A","quantity":1}]'::jsonb,
      '2026-07-27T18:00:00.000Z',
      '2026-07-27T18:30:00.000Z',
      'reserve-fefo-multisku-0001'
    );
  exception when others then
    denied := sqlerrm like '%command rejected%';
  end;
  if not denied then raise exception 'mismatched reserve replay was accepted'; end if;

  denied := false;
  begin
    perform public.research_reserve_inventory(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000099',
      '[
        {"sku":"SKU-A","quantity":2},
        {"sku":"SKU-A","quantity":4},
        {"sku":"SKU-B","quantity":2}
      ]'::jsonb,
      '2026-07-27T18:00:00.000Z',
      '2026-07-27T18:30:00.000Z',
      'reserve-fefo-multisku-0001'
    );
  exception when others then
    denied := sqlerrm like '%command rejected%';
  end;
  if not denied then raise exception 'cross-actor reserve probe was accepted'; end if;

  select jsonb_build_object(
    'reservations', (select count(*) from public.research_lot_reservations),
    'movements', (select count(*) from public.research_inventory_movements),
    'events', (select count(*) from public.research_inventory_reservation_events)
  ) into after_counts;
  if after_counts <> before_counts then
    raise exception 'failed replay probe changed state';
  end if;
end;
$$;

-- Release remains available after product-readiness drift and quarantines the
-- returned units instead of making them sellable.
do $$
declare
  target_ids text[];
  before_reserved integer;
  release_result jsonb;
  replay_result jsonb;
  release_movements integer;
  denied boolean;
  held_lot record;
begin
  select array_agg(reservation_id order by reservation_id)
    into target_ids
    from public.research_lot_reservations
   where status = 'held'
     and sku in ('SKU-A', 'SKU-B');
  select sum(quantity_reserved) into before_reserved
    from public.research_inventory_lots;

  denied := false;
  begin
    update public.research_products
       set admin_status = 'archived', active_state = false
     where id = '20000000-0000-4000-8000-000000000001';
  exception when others then
    denied := sqlerrm like '%readiness invalidation conflicts%';
  end;
  if not denied then
    raise exception 'product readiness invalidation bypassed an active hold';
  end if;
  for held_lot in
    select distinct l.id, l.version
      from public.research_inventory_lots l
     join public.research_lot_reservation_allocations a on a.lot_uuid = l.id
      join public.research_lot_reservations r on r.id = a.reservation_id
     where r.reservation_id = any(target_ids)
       and l.sku = 'SKU-A'
     order by l.id
  loop
    perform public.research_set_inventory_lot_disposition(
      held_lot.id,
      'quarantined',
      held_lot.version,
      'drift-' || substr(held_lot.id::text, 1, 24),
      'Verifier operational readiness drift',
      '00000000-0000-4000-8000-000000000002',
      '2026-07-27T18:04:00.000Z'
    );
  end loop;
  release_result := public.research_release_inventory_reservations(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    target_ids,
    '2026-07-27T18:05:00.000Z',
    'release-fefo-multisku-0001',
    'Payment was not attempted'
  );
  if release_result->>'action' <> 'release'
     or exists (
       select 1 from public.research_lot_reservations
        where reservation_id = any(target_ids) and status <> 'released'
     )
     or (select sum(quantity_reserved) from public.research_inventory_lots) <>
        before_reserved - 8 then
    raise exception 'release did not settle the exact held quantities';
  end if;
  if (
    select quantity_quarantined
      from public.research_inventory_lots
     where lot_id = 'LOT-A-EARLY'
  ) <> 3 then
    raise exception 'readiness-drift release returned stock to exposure';
  end if;

  select count(*) into release_movements
    from public.research_inventory_movements
   where reason = 'Atomic inventory reservation release';
  replay_result := public.research_release_inventory_reservations(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    target_ids,
    '2026-07-27T18:05:00.000Z',
    'release-fefo-multisku-0001',
    'Payment was not attempted'
  );
  if replay_result->>'idempotentReplay' <> 'true'
     or (
       select count(*) from public.research_inventory_movements
        where reason = 'Atomic inventory reservation release'
     ) <> release_movements then
    raise exception 'release replay changed inventory twice';
  end if;

  denied := false;
  begin
    perform public.research_release_inventory_reservations(
      '00000000-0000-4000-8000-000000000099',
      '00000000-0000-4000-8000-000000000002',
      target_ids,
      '2026-07-27T18:05:00.000Z',
      'release-cross-member-0001',
      'Cross member probe'
    );
  exception when others then
    denied := sqlerrm like '%command rejected%';
  end;
  if not denied then raise exception 'cross-member release probe was accepted'; end if;

end;
$$;

-- New independent holds prove finalize and expire transition graphs.
do $$
declare
  finalize_reserve jsonb;
  expire_reserve jsonb;
  finalize_ids text[];
  expire_ids text[];
  before_reserved integer;
  after_finalize_reserved integer;
  before_snapshot jsonb;
  after_snapshot jsonb;
  denied boolean;
  held_lot record;
begin
  -- Re-release quarantined SKU-A fixture stock through the canonical lot path.
  for held_lot in
    select id, version, quantity_quarantined, disposition
      from public.research_inventory_lots
     where sku = 'SKU-A' and quantity_quarantined > 0
     order by id
  loop
    if held_lot.disposition <> 'quarantined' then
      perform public.research_set_inventory_lot_disposition(
        held_lot.id,
        'quarantined',
        held_lot.version,
        'rehold-' || substr(held_lot.id::text, 1, 24),
        'Verifier lot returned to hold',
        '00000000-0000-4000-8000-000000000002',
        '2026-07-27T18:06:00.000Z'
      );
      held_lot.version := held_lot.version + 1;
    end if;
    perform public.research_apply_inventory_movement(
      held_lot.id,
      'quarantine_release',
      held_lot.quantity_quarantined,
      'quarantined',
      held_lot.version,
      'reopen-' || substr(held_lot.id::text, 1, 24),
      'Verifier stock re-release',
      '00000000-0000-4000-8000-000000000002',
      '2026-07-27T18:06:01.000Z'
    );
    held_lot.version := held_lot.version + 1;
    perform public.research_set_inventory_lot_disposition(
      held_lot.id,
      'available',
      held_lot.version,
      'reavailable-' || substr(held_lot.id::text, 1, 20),
      'Verifier lot available again',
      '00000000-0000-4000-8000-000000000002',
      '2026-07-27T18:06:02.000Z'
    );
  end loop;

  finalize_reserve := public.research_reserve_inventory(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '[{"sku":"SKU-A","quantity":2}]'::jsonb,
    '2026-07-27T18:10:00.000Z',
    '2026-07-27T18:40:00.000Z',
    'reserve-finalize-0001'
  );
  select array_agg(value->>'reservationId')
    into finalize_ids
    from jsonb_array_elements(finalize_reserve->'reservations');
  select jsonb_build_object(
    'headers', (select jsonb_agg(to_jsonb(r) order by r.reservation_id)
      from public.research_lot_reservations r
      where r.reservation_id = any(finalize_ids)),
    'lots', (select jsonb_agg(to_jsonb(l) order by l.id)
      from public.research_inventory_lots l
      where l.id in (
        select a.lot_uuid
          from public.research_lot_reservation_allocations a
          join public.research_lot_reservations r on r.id = a.reservation_id
         where r.reservation_id = any(finalize_ids)
      )),
    'movements', (select count(*) from public.research_inventory_movements),
    'events', (select count(*) from public.research_inventory_reservation_events)
  ) into before_snapshot;
  denied := false;
  begin
    perform public.research_release_inventory_reservations(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      finalize_ids,
      '2026-07-27T18:09:00.000Z',
      'deny-backdated-release-0001',
      'Backdated transition probe'
    );
  exception when others then denied := sqlerrm like '%command rejected%'; end;
  if not denied then raise exception 'backdated release was accepted'; end if;
  denied := false;
  begin
    perform public.research_finalize_inventory_reservations(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      finalize_ids,
      '2026-07-27T18:09:00.000Z',
      'deny-backdated-finalize-0001',
      'Backdated transition probe'
    );
  exception when others then denied := sqlerrm like '%command rejected%'; end;
  if not denied then raise exception 'backdated finalize was accepted'; end if;
  select jsonb_build_object(
    'headers', (select jsonb_agg(to_jsonb(r) order by r.reservation_id)
      from public.research_lot_reservations r
      where r.reservation_id = any(finalize_ids)),
    'lots', (select jsonb_agg(to_jsonb(l) order by l.id)
      from public.research_inventory_lots l
      where l.id in (
        select a.lot_uuid
          from public.research_lot_reservation_allocations a
          join public.research_lot_reservations r on r.id = a.reservation_id
         where r.reservation_id = any(finalize_ids)
      )),
    'movements', (select count(*) from public.research_inventory_movements),
    'events', (select count(*) from public.research_inventory_reservation_events)
  ) into after_snapshot;
  if after_snapshot <> before_snapshot then
    raise exception 'backdated release/finalize mutated durable state';
  end if;
  select sum(quantity_reserved) into before_reserved
    from public.research_inventory_lots;
  perform public.research_finalize_inventory_reservations(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    finalize_ids,
    '2026-07-27T18:11:00.000Z',
    'finalize-hold-0001',
    'Settlement accepted'
  );
  select sum(quantity_reserved) into after_finalize_reserved
    from public.research_inventory_lots;
  if after_finalize_reserved <> before_reserved
     or exists (
       select 1 from public.research_lot_reservations
        where reservation_id = any(finalize_ids) and status <> 'finalized'
     ) then
    raise exception 'finalize changed inventory or failed transition';
  end if;
  perform public.research_finalize_inventory_reservations(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    finalize_ids,
    '2026-07-27T18:11:00.000Z',
    'finalize-hold-0001',
    'Settlement accepted'
  );

  denied := false;
  begin
    perform public.research_release_inventory_reservations(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      finalize_ids,
      '2026-07-27T18:12:00.000Z',
      'release-finalized-0001',
      'Invalid release after settlement'
    );
  exception when others then
    denied := sqlerrm like '%command rejected%';
  end;
  if not denied then raise exception 'finalized reservation was released'; end if;

  expire_reserve := public.research_reserve_inventory(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '[{"sku":"SKU-B","quantity":1}]'::jsonb,
    '2026-07-27T18:10:00.000Z',
    '2026-07-27T18:20:00.000Z',
    'reserve-expire-0001'
  );
  select array_agg(value->>'reservationId')
    into expire_ids
    from jsonb_array_elements(expire_reserve->'reservations');
  update public.research_lot_reservations
     set updated_at = '2026-07-27T18:30:00.000Z'
   where reservation_id = any(expire_ids);
  select jsonb_build_object(
    'headers', (select jsonb_agg(to_jsonb(r) order by r.reservation_id)
      from public.research_lot_reservations r
      where r.reservation_id = any(expire_ids)),
    'lots', (select jsonb_agg(to_jsonb(l) order by l.id)
      from public.research_inventory_lots l
      where l.id in (
        select a.lot_uuid
          from public.research_lot_reservation_allocations a
          join public.research_lot_reservations r on r.id = a.reservation_id
         where r.reservation_id = any(expire_ids)
      )),
    'movements', (select count(*) from public.research_inventory_movements),
    'events', (select count(*) from public.research_inventory_reservation_events)
  ) into before_snapshot;
  denied := false;
  begin
    perform public.research_expire_inventory_reservations(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      expire_ids,
      '2026-07-27T18:20:00.000Z',
      'deny-backdated-expire-0001',
      'Backdated transition probe'
    );
  exception when others then denied := sqlerrm like '%command rejected%'; end;
  if not denied then raise exception 'backdated expire was accepted'; end if;
  select jsonb_build_object(
    'headers', (select jsonb_agg(to_jsonb(r) order by r.reservation_id)
      from public.research_lot_reservations r
      where r.reservation_id = any(expire_ids)),
    'lots', (select jsonb_agg(to_jsonb(l) order by l.id)
      from public.research_inventory_lots l
      where l.id in (
        select a.lot_uuid
          from public.research_lot_reservation_allocations a
          join public.research_lot_reservations r on r.id = a.reservation_id
         where r.reservation_id = any(expire_ids)
      )),
    'movements', (select count(*) from public.research_inventory_movements),
    'events', (select count(*) from public.research_inventory_reservation_events)
  ) into after_snapshot;
  if after_snapshot <> before_snapshot then
    raise exception 'backdated expire mutated durable state';
  end if;
  update public.research_lot_reservations
     set updated_at = '2026-07-27T18:10:00.000Z'
   where reservation_id = any(expire_ids);
  denied := false;
  begin
    perform public.research_expire_inventory_reservations(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      expire_ids,
      '2026-07-27T18:19:59.000Z',
      'expire-too-early-0001',
      'Expiry sweep'
    );
  exception when others then
    denied := sqlerrm like '%command rejected%';
  end;
  if not denied then raise exception 'unexpired reservation was expired'; end if;

  perform public.research_expire_inventory_reservations(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    expire_ids,
    '2026-07-27T18:20:00.000Z',
    'expire-held-0001',
    'Expiry sweep'
  );
  if exists (
    select 1 from public.research_lot_reservations
     where reservation_id = any(expire_ids) and status <> 'expired'
  ) then
    raise exception 'expired hold did not transition';
  end if;
  perform public.research_expire_inventory_reservations(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    expire_ids,
    '2026-07-27T18:20:00.000Z',
    'expire-held-0001',
    'Expiry sweep'
  );
end;
$$;

-- Missing, draft, archived, expired, product/variant/SKU mismatch, and failed
-- COA inputs all fail closed with zero reservation mutation.
do $$
declare
  before_count integer;
  denied boolean;
  lot_uuid uuid;
  candidate record;
begin
  select count(*) into before_count from public.research_lot_reservations;
  for candidate in
    select *
      from (values
        ('SKU-MISSING', 'missing'),
        ('SKU-DRAFT', 'draft')
      ) as denied_input(sku, label)
  loop
    denied := false;
    begin
      perform public.research_reserve_inventory(
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        jsonb_build_array(jsonb_build_object('sku', candidate.sku, 'quantity', 1)),
        '2026-07-27T18:25:00.000Z',
        '2026-07-27T18:55:00.000Z',
        'deny-' || candidate.label || '-reservation-0001'
      );
    exception when others then
      denied := sqlerrm like '%command rejected%';
    end;
    if not denied then raise exception '% reservation was accepted', candidate.label; end if;
  end loop;

  update public.research_products
     set admin_status = 'archived', active_state = false
   where id = '20000000-0000-4000-8000-000000000002';
  denied := false;
  begin
    perform public.research_reserve_inventory(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '[{"sku":"SKU-B","quantity":1}]'::jsonb,
      '2026-07-27T18:25:00.000Z',
      '2026-07-27T18:55:00.000Z',
      'deny-archived-reservation-0001'
    );
  exception when others then denied := sqlerrm like '%command rejected%'; end;
  if not denied then raise exception 'archived product reservation was accepted'; end if;
  update public.research_products
     set admin_status = 'approved', active_state = true
   where id = '20000000-0000-4000-8000-000000000002';

  select id into lot_uuid from public.research_inventory_lots where lot_id = 'LOT-B';
  update public.research_inventory_lots
     set expiry_date = '2026-07-27'
   where id = lot_uuid;
  denied := false;
  begin
    perform public.research_reserve_inventory(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '[{"sku":"SKU-B","quantity":1}]'::jsonb,
      '2026-07-27T18:25:00.000Z',
      '2026-07-27T18:55:00.000Z',
      'deny-expired-reservation-0001'
    );
  exception when others then denied := sqlerrm like '%command rejected%'; end;
  if not denied then raise exception 'expired lot reservation was accepted'; end if;
  update public.research_inventory_lots set expiry_date = '2026-10-15' where id = lot_uuid;

  perform set_config('xenios.quality_command', 'allowed', true);
  update public.research_lot_quality_tests
     set state = 'failed',
         method = 'verified-method',
         result = 'failed',
         reviewed_by = '00000000-0000-4000-8000-000000000002',
         reviewed_at = '2026-07-27T18:26:00.000Z'
   where quality_document_id = (
     select id from public.research_lot_quality_documents where lot_id = lot_uuid
   ) and test_key = 'sterility';
  denied := false;
  begin
    perform public.research_reserve_inventory(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '[{"sku":"SKU-B","quantity":1}]'::jsonb,
      '2026-07-27T18:27:00.000Z',
      '2026-07-27T18:57:00.000Z',
      'deny-failed-coa-reservation-0001'
    );
  exception when others then denied := sqlerrm like '%command rejected%'; end;
  if not denied then raise exception 'failed COA reservation was accepted'; end if;

  denied := false;
  begin
    update public.research_inventory_lots
       set variant_id = '21000000-0000-4000-8000-000000000001'
     where id = lot_uuid;
  exception when others then
    denied := sqlerrm like '%identity is not ready%';
  end;
  if not denied then
    raise exception 'mismatched lot identity mutation was accepted';
  end if;
  if (select count(*) from public.research_lot_reservations) <> before_count then
    raise exception 'failed readiness probes persisted reservations';
  end if;
end;
$$;

-- Event receipts are append-only and contain hashes rather than raw command
-- keys or actor identity.
do $$
declare
  blocked boolean := false;
begin
  if exists (
    select 1
      from public.research_inventory_reservation_events
     where idempotency_key_hash in (
       'reserve-fefo-multisku-0001',
       'release-fefo-multisku-0001'
     )
        or actor_member_scope_hash like '%00000000-0000-4000-8000-000000000002%'
        or redacted_result::text like '%reserve-fefo-multisku-0001%'
  ) then
    raise exception 'reservation event leaked raw command identity';
  end if;
  begin
    update public.research_inventory_reservation_events
       set redacted_result = '{}'::jsonb
     where id = (select id from public.research_inventory_reservation_events limit 1);
  exception when others then
    blocked := sqlerrm like '%events are immutable%';
  end;
  if not blocked then raise exception 'reservation event update was not denied'; end if;
end;
$$;

-- A transaction that aborts after reserve leaves no header, allocation,
-- movement, or event receipt.
create temporary table reservation_rollback_counts as
select
  (select count(*) from public.research_lot_reservations) as reservations,
  (select count(*) from public.research_lot_reservation_allocations) as allocations,
  (select count(*) from public.research_inventory_movements) as movements,
  (select count(*) from public.research_inventory_reservation_events) as events;

begin;
select public.research_reserve_inventory(
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '[{"sku":"SKU-A","quantity":1}]'::jsonb,
  '2026-07-27T18:28:00.000Z',
  '2026-07-27T18:58:00.000Z',
  'rollback-reservation-0001'
);
rollback;

do $$
begin
  if exists (
    select 1
      from reservation_rollback_counts before
     where before.reservations <> (select count(*) from public.research_lot_reservations)
        or before.allocations <> (select count(*) from public.research_lot_reservation_allocations)
        or before.movements <> (select count(*) from public.research_inventory_movements)
        or before.events <> (select count(*) from public.research_inventory_reservation_events)
  ) then
    raise exception 'reservation rollback left residual rows';
  end if;
end;
$$;

-- Disposable cleanup proves the candidate itself seeded nothing and every test
-- artifact can be returned to zero without weakening production triggers.
truncate table
  public.research_inventory_reservation_events,
  public.research_lot_reservation_allocations,
  public.research_lot_reservations,
  public.research_inventory_movements,
  public.research_inventory_lot_events,
  public.research_lot_quality_access_events,
  public.research_lot_quality_events,
  public.research_lot_quality_tests,
  public.research_lot_quality_documents,
  public.research_inventory_lots,
  public.research_product_variants,
  public.research_products
restart identity cascade;

do $$
begin
  if (select count(*) from public.research_inventory_reservation_events) <> 0
     or (select count(*) from public.research_lot_reservation_allocations) <> 0
     or (select count(*) from public.research_lot_reservations) <> 0
     or (select count(*) from public.research_inventory_movements) <> 0
     or (select count(*) from public.research_inventory_lots) <> 0 then
    raise exception 'disposable verifier did not return reservation state to zero';
  end if;
end;
$$;
