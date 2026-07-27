-- Website 4 Research Commerce Wave 3: atomic inventory reservations.
--
-- Route-free and additive. This migration reuses the canonical Wave 2 lot and
-- movement commands plus the dormant Track B reservation tables. It creates
-- only the append-only command receipt ledger required for durable replay and
-- audit. Checkout remains disabled until a later integration adopts the port.

create extension if not exists pgcrypto;

alter table public.research_lot_reservations
  add column if not exists version bigint not null default 1;
alter table public.research_lot_reservations
  add column if not exists updated_at timestamptz not null default now();
alter table public.research_lot_reservations
  add column if not exists expired_at timestamptz;

alter table public.research_lot_reservations
  drop constraint if exists research_lot_reservations_status_check;
alter table public.research_lot_reservations
  drop constraint if exists research_lot_reservations_terminal_dates;
alter table public.research_lot_reservations
  add constraint research_lot_reservations_status_check
    check (status in ('held', 'released', 'finalized', 'expired'));
alter table public.research_lot_reservations
  add constraint research_lot_reservations_terminal_dates check (
    (
      status = 'held'
      and released_at is null
      and finalized_at is null
      and expired_at is null
    )
    or (
      status = 'released'
      and released_at is not null
      and finalized_at is null
      and expired_at is null
    )
    or (
      status = 'finalized'
      and released_at is null
      and finalized_at is not null
      and expired_at is null
    )
    or (
      status = 'expired'
      and released_at is null
      and finalized_at is null
      and expired_at is not null
    )
  );

alter table public.research_lot_reservation_allocations
  add column if not exists lot_uuid uuid
    references public.research_inventory_lots(id);
alter table public.research_lot_reservation_allocations
  add column if not exists movement_id uuid
    references public.research_inventory_movements(id);
alter table public.research_lot_reservation_allocations
  add column if not exists resulting_lot_version bigint;

-- Production is intentionally empty at this boundary. These statements make a
-- half-described reservation allocation unrepresentable after migration.
alter table public.research_lot_reservation_allocations
  alter column lot_uuid set not null;
alter table public.research_lot_reservation_allocations
  alter column movement_id set not null;
alter table public.research_lot_reservation_allocations
  alter column resulting_lot_version set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'research_lot_reservation_allocations_version_positive'
       and conrelid = 'public.research_lot_reservation_allocations'::regclass
  ) then
    alter table public.research_lot_reservation_allocations
      add constraint research_lot_reservation_allocations_version_positive
      check (resulting_lot_version > 1);
  end if;
end;
$$;

create table if not exists public.research_inventory_reservation_events (
  id uuid primary key default gen_random_uuid(),
  action text not null
    check (action in ('reserve', 'release', 'finalize', 'expire')),
  idempotency_key_hash text not null unique
    check (char_length(idempotency_key_hash) = 64),
  command_hash text not null
    check (char_length(command_hash) = 64),
  actor_member_scope_hash text not null
    check (char_length(actor_member_scope_hash) = 64),
  reservation_ids text[] not null
    check (cardinality(reservation_ids) between 1 and 100),
  reservation_versions jsonb not null
    check (jsonb_typeof(reservation_versions) = 'object'),
  redacted_result jsonb not null
    check (jsonb_typeof(redacted_result) = 'object'),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
create index if not exists research_inventory_reservation_events_reservation_idx
  on public.research_inventory_reservation_events using gin(reservation_ids);

create or replace function public.research_inventory_reservation_event_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'inventory reservation events are immutable';
end;
$$;

drop trigger if exists research_inventory_reservation_events_no_update
  on public.research_inventory_reservation_events;
create trigger research_inventory_reservation_events_no_update
before update or delete on public.research_inventory_reservation_events
for each row execute function public.research_inventory_reservation_event_immutable();

-- Reservation commands and every canonical mutation that can invalidate
-- product/variant/COA readiness share this per-lot transaction lock. The AFTER
-- phase prevents an invalidation from committing while an active hold depends
-- on that exact lot through its expiry horizon.
create or replace function public.research_inventory_readiness_serialization_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_lot_ids uuid[];
  v_product_ids uuid[];
  v_variant_ids uuid[];
  v_lot_id uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_hold_horizon timestamptz;
begin
  if tg_table_name = 'research_lot_quality_documents' then
    if tg_op = 'DELETE' then
      v_lot_ids := array[old.lot_id];
    else
      v_lot_ids := array[new.lot_id];
    end if;
  elsif tg_table_name = 'research_lot_quality_tests' then
    select array_agg(distinct d.lot_id order by d.lot_id)
      into v_lot_ids
      from public.research_lot_quality_documents d
     where d.id = case
       when tg_op = 'DELETE' then old.quality_document_id
       else new.quality_document_id
     end;
  elsif tg_table_name = 'research_products' then
    v_product_ids := array[
      case when tg_op = 'DELETE' then old.id else new.id end
    ];
    select array_agg(l.id order by l.id)
      into v_lot_ids
      from public.research_inventory_lots l
     where l.product_id = case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name = 'research_product_variants' then
    v_product_ids := array[
      case when tg_op = 'DELETE' then old.product_id else new.product_id end
    ];
    v_variant_ids := array[
      case when tg_op = 'DELETE' then old.id else new.id end
    ];
    select array_agg(l.id order by l.id)
      into v_lot_ids
      from public.research_inventory_lots l
     where l.variant_id = case when tg_op = 'DELETE' then old.id else new.id end;
  else
    raise exception 'inventory readiness serialization target is invalid';
  end if;

  if v_product_ids is null then
    select array_agg(distinct l.product_id order by l.product_id)
      into v_product_ids
      from public.research_inventory_lots l
     where l.id = any(coalesce(v_lot_ids, array[]::uuid[]));
  end if;
  if v_variant_ids is null then
    select array_agg(distinct l.variant_id order by l.variant_id)
      into v_variant_ids
      from public.research_inventory_lots l
     where l.id = any(coalesce(v_lot_ids, array[]::uuid[]));
  end if;

  -- Invalidations never wait behind an exposure-increasing shared identity
  -- lock. Failing immediately avoids continuing an UPDATE with a pre-wait
  -- statement snapshot that could miss a newly committed lot or hold.
  for v_product_id in
    select value
      from unnest(coalesce(v_product_ids, array[]::uuid[])) source(value)
     order by value
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(
      'xenios:inventory-product-readiness:v1|' || v_product_id::text,
      0
    )) then
      raise exception 'readiness invalidation conflicts with active inventory work';
    end if;
  end loop;
  for v_variant_id in
    select value
      from unnest(coalesce(v_variant_ids, array[]::uuid[])) source(value)
     order by value
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(
      'xenios:inventory-variant-readiness:v1|' || v_variant_id::text,
      0
    )) then
      raise exception 'readiness invalidation conflicts with active inventory work';
    end if;
  end loop;
  for v_lot_id in
    select value from unnest(coalesce(v_lot_ids, array[]::uuid[])) source(value)
    order by value
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(
      'xenios:inventory-readiness:v1|' || v_lot_id::text,
      0
    )) then
      raise exception 'readiness invalidation conflicts with active inventory work';
    end if;
  end loop;

  if tg_when = 'AFTER' then
    for v_lot_id in
      select value from unnest(coalesce(v_lot_ids, array[]::uuid[])) source(value)
      order by value
    loop
      select max(r.expires_at)
        into v_hold_horizon
        from public.research_lot_reservation_allocations a
        join public.research_lot_reservations r on r.id = a.reservation_id
       where a.lot_uuid = v_lot_id
         and r.status = 'held';
      if v_hold_horizon is not null
         and not public.research_lot_quality_ready(v_lot_id, v_hold_horizon) then
        raise exception 'readiness invalidation conflicts with an active inventory reservation';
      end if;
    end loop;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.research_inventory_lot_identity_serialization_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.product_id is null
     or new.variant_id is null
     or nullif(btrim(new.sku), '') is null then
    raise exception 'inventory lot identity is incomplete';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended(
    'xenios:inventory-product-readiness:v1|' || new.product_id::text,
    0
  ));
  perform pg_advisory_xact_lock_shared(hashtextextended(
    'xenios:inventory-variant-readiness:v1|' || new.variant_id::text,
    0
  ));
  if not public.research_inventory_product_variant_ready(
    new.product_id,
    new.variant_id,
    new.sku
  ) then
    raise exception 'inventory lot identity is not ready';
  end if;
  return new;
end;
$$;

drop trigger if exists research_inventory_lot_identity_serialization
  on public.research_inventory_lots;
create trigger research_inventory_lot_identity_serialization
before insert or update of product_id, variant_id, sku
on public.research_inventory_lots
for each row execute function public.research_inventory_lot_identity_serialization_guard();

drop trigger if exists research_reservation_quality_document_readiness_lock
  on public.research_lot_quality_documents;
create trigger research_reservation_quality_document_readiness_lock
before insert or update or delete on public.research_lot_quality_documents
for each row execute function public.research_inventory_readiness_serialization_guard();
drop trigger if exists research_reservation_quality_document_readiness_validate
  on public.research_lot_quality_documents;
create trigger research_reservation_quality_document_readiness_validate
after insert or update or delete on public.research_lot_quality_documents
for each row execute function public.research_inventory_readiness_serialization_guard();

drop trigger if exists research_reservation_quality_test_readiness_lock
  on public.research_lot_quality_tests;
create trigger research_reservation_quality_test_readiness_lock
before insert or update or delete on public.research_lot_quality_tests
for each row execute function public.research_inventory_readiness_serialization_guard();
drop trigger if exists research_reservation_quality_test_readiness_validate
  on public.research_lot_quality_tests;
create trigger research_reservation_quality_test_readiness_validate
after insert or update or delete on public.research_lot_quality_tests
for each row execute function public.research_inventory_readiness_serialization_guard();

drop trigger if exists research_reservation_product_readiness_lock
  on public.research_products;
create trigger research_reservation_product_readiness_lock
before update or delete on public.research_products
for each row execute function public.research_inventory_readiness_serialization_guard();
drop trigger if exists research_reservation_product_readiness_validate
  on public.research_products;
create trigger research_reservation_product_readiness_validate
after update or delete on public.research_products
for each row execute function public.research_inventory_readiness_serialization_guard();

drop trigger if exists research_reservation_variant_readiness_lock
  on public.research_product_variants;
create trigger research_reservation_variant_readiness_lock
before update or delete on public.research_product_variants
for each row execute function public.research_inventory_readiness_serialization_guard();
drop trigger if exists research_reservation_variant_readiness_validate
  on public.research_product_variants;
create trigger research_reservation_variant_readiness_validate
after update or delete on public.research_product_variants
for each row execute function public.research_inventory_readiness_serialization_guard();

create or replace function public.research_reserve_inventory(
  p_member_id uuid,
  p_actor_id uuid,
  p_lines jsonb,
  p_at timestamptz,
  p_expires_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  prior public.research_inventory_reservation_events%rowtype;
  v_item jsonb;
  v_lines jsonb;
  v_skus text[];
  v_quantities integer[];
  v_total bigint;
  v_index integer;
  v_sku text;
  v_required integer;
  v_remaining integer;
  v_candidates jsonb;
  v_candidate jsonb;
  v_candidate_total bigint;
  v_product_id uuid;
  v_variant_id uuid;
  v_binding_product uuid;
  v_binding_variant uuid;
  v_lot record;
  v_take integer;
  v_movement jsonb;
  v_movement_id uuid;
  v_lot_version bigint;
  v_reservation_uuid uuid;
  v_reservation_id text;
  v_seq integer;
  v_allocations jsonb;
  v_reservations jsonb := '[]'::jsonb;
  v_versions jsonb := '{}'::jsonb;
  v_result jsonb;
  v_scope_hash text;
  v_idempotency_hash text;
  v_command_hash text;
  v_child_key text;
begin
  if p_member_id is null
     or p_actor_id is null
     or p_at is null
     or p_expires_at is null
     or date_trunc('milliseconds', p_at) <> p_at
     or date_trunc('milliseconds', p_expires_at) <> p_expires_at
     or p_expires_at <= p_at
     or char_length(coalesce(p_idempotency_key, '')) not between 16 and 160
     or btrim(p_idempotency_key) <> p_idempotency_key
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'inventory reservation command rejected';
  end if;

  for v_item in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or not (v_item ? 'sku')
       or not (v_item ? 'quantity')
       or (select count(*) from jsonb_object_keys(v_item)) <> 2
       or jsonb_typeof(v_item->'sku') <> 'string'
       or jsonb_typeof(v_item->'quantity') <> 'number'
       or char_length(v_item->>'sku') not between 1 and 120
       or btrim(v_item->>'sku') <> v_item->>'sku'
       or (v_item->>'sku') !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$'
       or (v_item->>'quantity') !~ '^[0-9]+$'
       or (v_item->>'quantity')::numeric < 1
       or (v_item->>'quantity')::numeric > 100000000 then
      raise exception 'inventory reservation command rejected';
    end if;
  end loop;

  select
    array_agg(sku order by sku),
    array_agg(quantity::integer order by sku),
    sum(quantity),
    jsonb_agg(
      jsonb_build_object('sku', sku, 'quantity', quantity)
      order by sku
    )
  into v_skus, v_quantities, v_total, v_lines
  from (
    select
      value->>'sku' as sku,
      sum((value->>'quantity')::bigint) as quantity
    from jsonb_array_elements(p_lines)
    group by value->>'sku'
  ) consolidated;

  if v_total is null
     or v_total > 100000000
     or exists (
       select 1
       from unnest(v_quantities) as q(quantity)
       where q.quantity < 1 or q.quantity > 100000000
     ) then
    raise exception 'inventory reservation command rejected';
  end if;

  v_scope_hash := encode(extensions.digest(
    concat_ws('|',
      'xenios:inventory-reservation-scope:v1',
      p_actor_id::text,
      p_member_id::text
    ),
    'sha256'
  ), 'hex');
  v_idempotency_hash := encode(extensions.digest(
    concat_ws('|',
      'xenios:inventory-reservation:reserve:v1',
      p_idempotency_key
    ),
    'sha256'
  ), 'hex');
  v_command_hash := encode(extensions.digest(
    concat_ws('|',
      'xenios:inventory-reservation-command:reserve:v1',
      p_member_id::text,
      v_lines::text,
      p_at::text,
      p_expires_at::text
    ),
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(v_idempotency_hash, 0));
  select * into prior
    from public.research_inventory_reservation_events
   where idempotency_key_hash = v_idempotency_hash
   for update;
  if found then
    if prior.action <> 'reserve'
       or prior.actor_member_scope_hash <> v_scope_hash
       or prior.command_hash <> v_command_hash then
      raise exception 'inventory reservation command rejected';
    end if;
    return jsonb_set(prior.redacted_result, '{idempotentReplay}', 'true'::jsonb);
  end if;

  for v_index in 1..cardinality(v_skus)
  loop
    v_sku := v_skus[v_index];
    v_required := v_quantities[v_index];
    v_remaining := v_required;
    v_candidates := '[]'::jsonb;
    v_candidate_total := 0;
    v_binding_product := null;
    v_binding_variant := null;

    -- Stable identity locks close the zero-lot/new-lot phantom. Shared locks
    -- preserve concurrent reservations while invalidations use exclusive
    -- try-locks and fail instead of continuing with a stale statement snapshot.
    for v_product_id in
      select distinct l.product_id
        from public.research_inventory_lots l
       where l.sku = v_sku
         and l.product_id is not null
         and l.variant_id is not null
         and l.quantity_available > 0
       order by l.product_id
    loop
      perform pg_advisory_xact_lock_shared(hashtextextended(
        'xenios:inventory-product-readiness:v1|' || v_product_id::text,
        0
      ));
    end loop;
    for v_variant_id in
      select distinct l.variant_id
        from public.research_inventory_lots l
       where l.sku = v_sku
         and l.product_id is not null
         and l.variant_id is not null
         and l.quantity_available > 0
       order by l.variant_id
    loop
      perform pg_advisory_xact_lock_shared(hashtextextended(
        'xenios:inventory-variant-readiness:v1|' || v_variant_id::text,
        0
      ));
    end loop;

    -- SKU order and FEFO order are deterministic, so overlapping commands lock
    -- the same candidate rows in the same order. Readiness is rechecked only
    -- after product, variant, lot-row, and per-lot readiness locks are held.
    for v_lot in
      select
        l.id,
        l.lot_id,
        l.product_id,
        l.variant_id,
        l.quantity_available,
        l.version
      from public.research_inventory_lots l
      where l.sku = v_sku
        and l.product_id is not null
        and l.variant_id is not null
        and l.quantity_available > 0
      order by
        least(l.expiry_date, coalesce(l.retest_date, l.expiry_date)),
        l.created_at,
        l.id
      for update of l
    loop
      perform pg_advisory_xact_lock_shared(hashtextextended(
        'xenios:inventory-product-readiness:v1|' || v_lot.product_id::text,
        0
      ));
      perform pg_advisory_xact_lock_shared(hashtextextended(
        'xenios:inventory-variant-readiness:v1|' || v_lot.variant_id::text,
        0
      ));
      perform pg_advisory_xact_lock(hashtextextended(
        'xenios:inventory-readiness:v1|' || v_lot.id::text,
        0
      ));
      if not public.research_inventory_product_variant_ready(
           v_lot.product_id,
           v_lot.variant_id,
           v_sku
         )
         or not public.research_lot_is_allocatable(v_lot.id, p_at)
         or not public.research_lot_is_allocatable(v_lot.id, p_expires_at) then
        continue;
      end if;
      if v_binding_product is null then
        v_binding_product := v_lot.product_id;
        v_binding_variant := v_lot.variant_id;
      elsif v_binding_product <> v_lot.product_id
         or v_binding_variant <> v_lot.variant_id then
        raise exception 'inventory reservation command rejected';
      end if;
      v_candidate_total := v_candidate_total + v_lot.quantity_available;
      v_candidates := v_candidates || jsonb_build_array(jsonb_build_object(
        'lotUuid', v_lot.id,
        'businessLotId', v_lot.lot_id,
        'quantityAvailable', v_lot.quantity_available,
        'version', v_lot.version
      ));
    end loop;

    if v_binding_product is null or v_candidate_total < v_required then
      raise exception 'inventory reservation command rejected';
    end if;

    v_reservation_uuid := gen_random_uuid();
    v_reservation_id := v_reservation_uuid::text;
    insert into public.research_lot_reservations (
      id,
      reservation_id,
      member_id,
      sku,
      quantity,
      status,
      expires_at,
      created_at,
      released_at,
      finalized_at,
      expired_at,
      version,
      updated_at
    ) values (
      v_reservation_uuid,
      v_reservation_id,
      p_member_id,
      v_sku,
      v_required,
      'held',
      p_expires_at,
      p_at,
      null,
      null,
      null,
      1,
      p_at
    );

    v_seq := 0;
    v_allocations := '[]'::jsonb;
    for v_candidate in select value from jsonb_array_elements(v_candidates)
    loop
      exit when v_remaining = 0;
      v_take := least(
        v_remaining,
        (v_candidate->>'quantityAvailable')::integer
      );
      if v_take < 1 then continue; end if;

      v_child_key := concat(
        'rv1:',
        substr(encode(extensions.digest(
          concat_ws('|',
            v_idempotency_hash,
            v_reservation_id,
            v_candidate->>'lotUuid',
            v_seq::text
          ),
          'sha256'
        ), 'hex'), 1, 48)
      );
      v_movement := public.research_apply_inventory_movement(
        (v_candidate->>'lotUuid')::uuid,
        'reserve',
        v_take,
        'available',
        (v_candidate->>'version')::bigint,
        v_child_key,
        'Atomic inventory reservation hold',
        p_actor_id::text,
        p_at
      );
      v_movement_id := (v_movement->>'movementId')::uuid;
      v_lot_version := (v_movement->>'version')::bigint;

      insert into public.research_lot_reservation_allocations (
        reservation_id,
        seq,
        lot_id,
        lot_uuid,
        quantity,
        movement_id,
        resulting_lot_version
      ) values (
        v_reservation_uuid,
        v_seq,
        v_candidate->>'businessLotId',
        (v_candidate->>'lotUuid')::uuid,
        v_take,
        v_movement_id,
        v_lot_version
      );
      v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
        'lotId', v_candidate->>'lotUuid',
        'quantity', v_take,
        'resultingLotVersion', v_lot_version
      ));
      v_remaining := v_remaining - v_take;
      v_seq := v_seq + 1;
    end loop;

    if v_remaining <> 0 then
      raise exception 'inventory reservation command rejected';
    end if;

    v_reservations := v_reservations || jsonb_build_array(jsonb_build_object(
      'reservationId', v_reservation_id,
      'sku', v_sku,
      'quantity', v_required,
      'status', 'held',
      'version', 1,
      'expiresAt', to_char(
        p_expires_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
      'allocations', v_allocations
    ));
    v_versions := v_versions || jsonb_build_object(v_reservation_id, 1);
  end loop;

  v_result := jsonb_build_object(
    'action', 'reserve',
    'idempotentReplay', false,
    'reservations', v_reservations
  );
  insert into public.research_inventory_reservation_events (
    action,
    idempotency_key_hash,
    command_hash,
    actor_member_scope_hash,
    reservation_ids,
    reservation_versions,
    redacted_result,
    occurred_at
  ) values (
    'reserve',
    v_idempotency_hash,
    v_command_hash,
    v_scope_hash,
    array(
      select value->>'reservationId'
      from jsonb_array_elements(v_reservations)
      order by value->>'reservationId'
    ),
    v_versions,
    v_result,
    p_at
  );
  return v_result;
end;
$$;

create or replace function public.research_release_inventory_reservations(
  p_member_id uuid,
  p_actor_id uuid,
  p_reservation_ids text[],
  p_at timestamptz,
  p_idempotency_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  prior public.research_inventory_reservation_events%rowtype;
  v_ids text[];
  v_header_ids uuid[];
  v_alloc record;
  v_lot public.research_inventory_lots%rowtype;
  v_available integer;
  v_reserved integer;
  v_quarantined integer;
  v_version bigint;
  v_child_key text;
  v_child_hash text;
  v_scope_hash text;
  v_idempotency_hash text;
  v_command_hash text;
  v_reservations jsonb;
  v_versions jsonb;
  v_result jsonb;
begin
  if p_member_id is null
     or p_actor_id is null
     or p_at is null
     or date_trunc('milliseconds', p_at) <> p_at
     or cardinality(p_reservation_ids) not between 1 and 100
     or char_length(coalesce(p_idempotency_key, '')) not between 16 and 160
     or btrim(p_idempotency_key) <> p_idempotency_key
     or char_length(coalesce(p_reason, '')) not between 3 and 500
     or btrim(p_reason) <> p_reason then
    raise exception 'inventory reservation command rejected';
  end if;
  select array_agg(distinct value order by value)
    into v_ids
    from unnest(p_reservation_ids) as source(value)
   where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  if coalesce(cardinality(v_ids), 0) <> cardinality(p_reservation_ids) then
    raise exception 'inventory reservation command rejected';
  end if;

  v_scope_hash := encode(extensions.digest(
    concat_ws('|', 'xenios:inventory-reservation-scope:v1',
      p_actor_id::text, p_member_id::text),
    'sha256'
  ), 'hex');
  v_idempotency_hash := encode(extensions.digest(
    concat_ws('|', 'xenios:inventory-reservation:release:v1', p_idempotency_key),
    'sha256'
  ), 'hex');
  v_command_hash := encode(extensions.digest(
    concat_ws('|', 'xenios:inventory-reservation-command:release:v1',
      p_member_id::text, to_jsonb(v_ids)::text, p_at::text, p_reason),
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(v_idempotency_hash, 0));
  select array_agg(locked.id order by locked.reservation_id)
    into v_header_ids
    from (
      select r.id, r.reservation_id
        from public.research_lot_reservations r
       where r.reservation_id = any(v_ids)
         and r.member_id = p_member_id
       order by r.reservation_id
       for update
    ) locked;
  if coalesce(cardinality(v_header_ids), 0) <> cardinality(v_ids) then
    raise exception 'inventory reservation command rejected';
  end if;

  select * into prior
    from public.research_inventory_reservation_events
   where idempotency_key_hash = v_idempotency_hash
   for update;
  if found then
    if prior.action <> 'release'
       or prior.actor_member_scope_hash <> v_scope_hash
       or prior.command_hash <> v_command_hash then
      raise exception 'inventory reservation command rejected';
    end if;
    return jsonb_set(prior.redacted_result, '{idempotentReplay}', 'true'::jsonb);
  end if;

  if exists (
    select 1 from public.research_lot_reservations
     where id = any(v_header_ids)
       and (
         status <> 'held'
         or p_at < created_at
         or p_at < updated_at
       )
  ) then
    raise exception 'inventory reservation command rejected';
  end if;

  for v_alloc in
    select
      a.lot_uuid,
      sum(a.quantity)::integer as quantity
    from public.research_lot_reservation_allocations a
    where a.reservation_id = any(v_header_ids)
    group by a.lot_uuid
    order by a.lot_uuid
  loop
    select * into v_lot
      from public.research_inventory_lots
     where id = v_alloc.lot_uuid
     for update;
    if not found or v_lot.quantity_reserved < v_alloc.quantity then
      raise exception 'inventory reservation command rejected';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
      'xenios:inventory-readiness:v1|' || v_lot.id::text,
      0
    ));

    v_available := v_lot.quantity_available;
    v_reserved := v_lot.quantity_reserved - v_alloc.quantity;
    v_quarantined := v_lot.quantity_quarantined;
    if v_lot.disposition = 'available'
       and public.research_lot_quality_ready(v_lot.id, p_at) then
      v_available := v_available + v_alloc.quantity;
    else
      v_quarantined := v_quarantined + v_alloc.quantity;
    end if;
    v_version := v_lot.version + 1;
    v_child_key := concat(
      'rr1:',
      substr(encode(extensions.digest(
        concat_ws('|', v_idempotency_hash, v_lot.id::text),
        'sha256'
      ), 'hex'), 1, 48)
    );
    v_child_hash := encode(extensions.digest(
      concat_ws('|', v_lot.id::text, 'release', v_alloc.quantity::text,
        v_lot.version::text, v_scope_hash),
      'sha256'
    ), 'hex');

    perform set_config('xenios.inventory_command', 'allowed', true);
    update public.research_inventory_lots
       set quantity_available = v_available,
           quantity_reserved = v_reserved,
           quantity_quarantined = v_quarantined,
           version = v_version,
           updated_at = p_at
     where id = v_lot.id;
    insert into public.research_inventory_movements (
      lot_id, movement_type, quantity, source_bucket,
      available_before, available_after, reserved_before, reserved_after,
      quarantined_before, quarantined_after, damaged_before, damaged_after,
      resulting_version, idempotency_key, command_hash, reason, actor_id, occurred_at
    ) values (
      v_lot.id, 'release', v_alloc.quantity, 'reserved',
      v_lot.quantity_available, v_available,
      v_lot.quantity_reserved, v_reserved,
      v_lot.quantity_quarantined, v_quarantined,
      v_lot.quantity_damaged, v_lot.quantity_damaged,
      v_version, v_child_key, v_child_hash,
      'Atomic inventory reservation release', p_actor_id::text, p_at
    );
  end loop;

  update public.research_lot_reservations
     set status = 'released',
         released_at = p_at,
         version = version + 1,
         updated_at = p_at
   where id = any(v_header_ids);

  select
    jsonb_agg(
      jsonb_build_object(
        'reservationId', r.reservation_id,
        'sku', r.sku,
        'quantity', r.quantity,
        'status', r.status,
        'version', r.version,
        'expiresAt', to_char(
          r.expires_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'allocations', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'lotId', a.lot_uuid,
              'quantity', a.quantity,
              'resultingLotVersion', a.resulting_lot_version
            ) order by a.seq
          ), '[]'::jsonb)
          from public.research_lot_reservation_allocations a
          where a.reservation_id = r.id
        )
      ) order by r.reservation_id
    ),
    jsonb_object_agg(r.reservation_id, r.version)
  into v_reservations, v_versions
  from public.research_lot_reservations r
  where r.id = any(v_header_ids);

  v_result := jsonb_build_object(
    'action', 'release',
    'idempotentReplay', false,
    'reservations', v_reservations
  );
  insert into public.research_inventory_reservation_events (
    action, idempotency_key_hash, command_hash, actor_member_scope_hash,
    reservation_ids, reservation_versions, redacted_result, occurred_at
  ) values (
    'release', v_idempotency_hash, v_command_hash, v_scope_hash,
    v_ids, v_versions, v_result, p_at
  );
  return v_result;
end;
$$;

create or replace function public.research_finalize_inventory_reservations(
  p_member_id uuid,
  p_actor_id uuid,
  p_reservation_ids text[],
  p_at timestamptz,
  p_idempotency_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  prior public.research_inventory_reservation_events%rowtype;
  v_ids text[];
  v_header_ids uuid[];
  v_alloc record;
  v_lot public.research_inventory_lots%rowtype;
  v_product_id uuid;
  v_variant_id uuid;
  v_scope_hash text;
  v_idempotency_hash text;
  v_command_hash text;
  v_reservations jsonb;
  v_versions jsonb;
  v_result jsonb;
begin
  if p_member_id is null
     or p_actor_id is null
     or p_at is null
     or date_trunc('milliseconds', p_at) <> p_at
     or cardinality(p_reservation_ids) not between 1 and 100
     or char_length(coalesce(p_idempotency_key, '')) not between 16 and 160
     or btrim(p_idempotency_key) <> p_idempotency_key
     or char_length(coalesce(p_reason, '')) not between 3 and 500
     or btrim(p_reason) <> p_reason then
    raise exception 'inventory reservation command rejected';
  end if;
  select array_agg(distinct value order by value)
    into v_ids
    from unnest(p_reservation_ids) as source(value)
   where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  if coalesce(cardinality(v_ids), 0) <> cardinality(p_reservation_ids) then
    raise exception 'inventory reservation command rejected';
  end if;

  v_scope_hash := encode(extensions.digest(
    concat_ws('|', 'xenios:inventory-reservation-scope:v1',
      p_actor_id::text, p_member_id::text),
    'sha256'
  ), 'hex');
  v_idempotency_hash := encode(extensions.digest(
    concat_ws('|', 'xenios:inventory-reservation:finalize:v1', p_idempotency_key),
    'sha256'
  ), 'hex');
  v_command_hash := encode(extensions.digest(
    concat_ws('|', 'xenios:inventory-reservation-command:finalize:v1',
      p_member_id::text, to_jsonb(v_ids)::text, p_at::text, p_reason),
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(v_idempotency_hash, 0));
  select array_agg(locked.id order by locked.reservation_id)
    into v_header_ids
    from (
      select r.id, r.reservation_id
        from public.research_lot_reservations r
       where r.reservation_id = any(v_ids)
         and r.member_id = p_member_id
       order by r.reservation_id
       for update
    ) locked;
  if coalesce(cardinality(v_header_ids), 0) <> cardinality(v_ids) then
    raise exception 'inventory reservation command rejected';
  end if;

  select * into prior
    from public.research_inventory_reservation_events
   where idempotency_key_hash = v_idempotency_hash
   for update;
  if found then
    if prior.action <> 'finalize'
       or prior.actor_member_scope_hash <> v_scope_hash
       or prior.command_hash <> v_command_hash then
      raise exception 'inventory reservation command rejected';
    end if;
    return jsonb_set(prior.redacted_result, '{idempotentReplay}', 'true'::jsonb);
  end if;

  if exists (
    select 1 from public.research_lot_reservations
     where id = any(v_header_ids)
       and (
         status <> 'held'
         or expires_at <= p_at
         or p_at < created_at
         or p_at < updated_at
       )
  ) then
    raise exception 'inventory reservation command rejected';
  end if;

  for v_product_id in
    select distinct l.product_id
      from public.research_lot_reservation_allocations a
      join public.research_inventory_lots l on l.id = a.lot_uuid
     where a.reservation_id = any(v_header_ids)
     order by l.product_id
  loop
    perform pg_advisory_xact_lock_shared(hashtextextended(
      'xenios:inventory-product-readiness:v1|' || v_product_id::text,
      0
    ));
  end loop;
  for v_variant_id in
    select distinct l.variant_id
      from public.research_lot_reservation_allocations a
      join public.research_inventory_lots l on l.id = a.lot_uuid
     where a.reservation_id = any(v_header_ids)
     order by l.variant_id
  loop
    perform pg_advisory_xact_lock_shared(hashtextextended(
      'xenios:inventory-variant-readiness:v1|' || v_variant_id::text,
      0
    ));
  end loop;

  for v_alloc in
    select
      a.lot_uuid,
      sum(a.quantity)::integer as quantity,
      array_agg(distinct r.sku order by r.sku) as skus
    from public.research_lot_reservation_allocations a
    join public.research_lot_reservations r on r.id = a.reservation_id
    where a.reservation_id = any(v_header_ids)
    group by a.lot_uuid
    order by a.lot_uuid
  loop
    select * into v_lot
      from public.research_inventory_lots
     where id = v_alloc.lot_uuid
     for update;
    if not found
       or cardinality(v_alloc.skus) <> 1
       or v_lot.sku <> v_alloc.skus[1]
       or v_lot.quantity_reserved < v_alloc.quantity then
      raise exception 'inventory reservation command rejected';
    end if;
    perform pg_advisory_xact_lock_shared(hashtextextended(
      'xenios:inventory-product-readiness:v1|' || v_lot.product_id::text,
      0
    ));
    perform pg_advisory_xact_lock_shared(hashtextextended(
      'xenios:inventory-variant-readiness:v1|' || v_lot.variant_id::text,
      0
    ));
    perform pg_advisory_xact_lock(hashtextextended(
      'xenios:inventory-readiness:v1|' || v_lot.id::text,
      0
    ));
    if v_lot.disposition <> 'available'
       or v_lot.recalled
       or not public.research_inventory_product_variant_ready(
         v_lot.product_id,
         v_lot.variant_id,
         v_lot.sku
       )
       or not public.research_lot_quality_ready(v_lot.id, p_at) then
      raise exception 'inventory reservation command rejected';
    end if;
  end loop;

  update public.research_lot_reservations
     set status = 'finalized',
         finalized_at = p_at,
         version = version + 1,
         updated_at = p_at
   where id = any(v_header_ids);

  select
    jsonb_agg(
      jsonb_build_object(
        'reservationId', r.reservation_id,
        'sku', r.sku,
        'quantity', r.quantity,
        'status', r.status,
        'version', r.version,
        'expiresAt', to_char(
          r.expires_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'allocations', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'lotId', a.lot_uuid,
              'quantity', a.quantity,
              'resultingLotVersion', a.resulting_lot_version
            ) order by a.seq
          ), '[]'::jsonb)
          from public.research_lot_reservation_allocations a
          where a.reservation_id = r.id
        )
      ) order by r.reservation_id
    ),
    jsonb_object_agg(r.reservation_id, r.version)
  into v_reservations, v_versions
  from public.research_lot_reservations r
  where r.id = any(v_header_ids);

  v_result := jsonb_build_object(
    'action', 'finalize',
    'idempotentReplay', false,
    'reservations', v_reservations
  );
  insert into public.research_inventory_reservation_events (
    action, idempotency_key_hash, command_hash, actor_member_scope_hash,
    reservation_ids, reservation_versions, redacted_result, occurred_at
  ) values (
    'finalize', v_idempotency_hash, v_command_hash, v_scope_hash,
    v_ids, v_versions, v_result, p_at
  );
  return v_result;
end;
$$;

create or replace function public.research_expire_inventory_reservations(
  p_member_id uuid,
  p_actor_id uuid,
  p_reservation_ids text[],
  p_at timestamptz,
  p_idempotency_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  prior public.research_inventory_reservation_events%rowtype;
  v_ids text[];
  v_header_ids uuid[];
  v_alloc record;
  v_lot public.research_inventory_lots%rowtype;
  v_available integer;
  v_reserved integer;
  v_quarantined integer;
  v_version bigint;
  v_child_key text;
  v_child_hash text;
  v_scope_hash text;
  v_idempotency_hash text;
  v_command_hash text;
  v_reservations jsonb;
  v_versions jsonb;
  v_result jsonb;
begin
  if p_member_id is null
     or p_actor_id is null
     or p_at is null
     or date_trunc('milliseconds', p_at) <> p_at
     or cardinality(p_reservation_ids) not between 1 and 100
     or char_length(coalesce(p_idempotency_key, '')) not between 16 and 160
     or btrim(p_idempotency_key) <> p_idempotency_key
     or char_length(coalesce(p_reason, '')) not between 3 and 500
     or btrim(p_reason) <> p_reason then
    raise exception 'inventory reservation command rejected';
  end if;
  select array_agg(distinct value order by value)
    into v_ids
    from unnest(p_reservation_ids) as source(value)
   where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  if coalesce(cardinality(v_ids), 0) <> cardinality(p_reservation_ids) then
    raise exception 'inventory reservation command rejected';
  end if;

  v_scope_hash := encode(extensions.digest(
    concat_ws('|', 'xenios:inventory-reservation-scope:v1',
      p_actor_id::text, p_member_id::text),
    'sha256'
  ), 'hex');
  v_idempotency_hash := encode(extensions.digest(
    concat_ws('|', 'xenios:inventory-reservation:expire:v1', p_idempotency_key),
    'sha256'
  ), 'hex');
  v_command_hash := encode(extensions.digest(
    concat_ws('|', 'xenios:inventory-reservation-command:expire:v1',
      p_member_id::text, to_jsonb(v_ids)::text, p_at::text, p_reason),
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(v_idempotency_hash, 0));
  select array_agg(locked.id order by locked.reservation_id)
    into v_header_ids
    from (
      select r.id, r.reservation_id
        from public.research_lot_reservations r
       where r.reservation_id = any(v_ids)
         and r.member_id = p_member_id
       order by r.reservation_id
       for update
    ) locked;
  if coalesce(cardinality(v_header_ids), 0) <> cardinality(v_ids) then
    raise exception 'inventory reservation command rejected';
  end if;

  select * into prior
    from public.research_inventory_reservation_events
   where idempotency_key_hash = v_idempotency_hash
   for update;
  if found then
    if prior.action <> 'expire'
       or prior.actor_member_scope_hash <> v_scope_hash
       or prior.command_hash <> v_command_hash then
      raise exception 'inventory reservation command rejected';
    end if;
    return jsonb_set(prior.redacted_result, '{idempotentReplay}', 'true'::jsonb);
  end if;

  if exists (
    select 1 from public.research_lot_reservations
     where id = any(v_header_ids)
       and (
         status <> 'held'
         or expires_at > p_at
         or p_at < created_at
         or p_at < updated_at
       )
  ) then
    raise exception 'inventory reservation command rejected';
  end if;

  for v_alloc in
    select
      a.lot_uuid,
      sum(a.quantity)::integer as quantity
    from public.research_lot_reservation_allocations a
    where a.reservation_id = any(v_header_ids)
    group by a.lot_uuid
    order by a.lot_uuid
  loop
    select * into v_lot
      from public.research_inventory_lots
     where id = v_alloc.lot_uuid
     for update;
    if not found or v_lot.quantity_reserved < v_alloc.quantity then
      raise exception 'inventory reservation command rejected';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
      'xenios:inventory-readiness:v1|' || v_lot.id::text,
      0
    ));

    v_available := v_lot.quantity_available;
    v_reserved := v_lot.quantity_reserved - v_alloc.quantity;
    v_quarantined := v_lot.quantity_quarantined;
    if v_lot.disposition = 'available'
       and public.research_lot_quality_ready(v_lot.id, p_at) then
      v_available := v_available + v_alloc.quantity;
    else
      v_quarantined := v_quarantined + v_alloc.quantity;
    end if;
    v_version := v_lot.version + 1;
    v_child_key := concat(
      're1:',
      substr(encode(extensions.digest(
        concat_ws('|', v_idempotency_hash, v_lot.id::text),
        'sha256'
      ), 'hex'), 1, 48)
    );
    v_child_hash := encode(extensions.digest(
      concat_ws('|', v_lot.id::text, 'expire', v_alloc.quantity::text,
        v_lot.version::text, v_scope_hash),
      'sha256'
    ), 'hex');

    perform set_config('xenios.inventory_command', 'allowed', true);
    update public.research_inventory_lots
       set quantity_available = v_available,
           quantity_reserved = v_reserved,
           quantity_quarantined = v_quarantined,
           version = v_version,
           updated_at = p_at
     where id = v_lot.id;
    insert into public.research_inventory_movements (
      lot_id, movement_type, quantity, source_bucket,
      available_before, available_after, reserved_before, reserved_after,
      quarantined_before, quarantined_after, damaged_before, damaged_after,
      resulting_version, idempotency_key, command_hash, reason, actor_id, occurred_at
    ) values (
      v_lot.id, 'release', v_alloc.quantity, 'reserved',
      v_lot.quantity_available, v_available,
      v_lot.quantity_reserved, v_reserved,
      v_lot.quantity_quarantined, v_quarantined,
      v_lot.quantity_damaged, v_lot.quantity_damaged,
      v_version, v_child_key, v_child_hash,
      'Expired inventory reservation release', p_actor_id::text, p_at
    );
  end loop;

  update public.research_lot_reservations
     set status = 'expired',
         expired_at = p_at,
         version = version + 1,
         updated_at = p_at
   where id = any(v_header_ids);

  select
    jsonb_agg(
      jsonb_build_object(
        'reservationId', r.reservation_id,
        'sku', r.sku,
        'quantity', r.quantity,
        'status', r.status,
        'version', r.version,
        'expiresAt', to_char(
          r.expires_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'allocations', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'lotId', a.lot_uuid,
              'quantity', a.quantity,
              'resultingLotVersion', a.resulting_lot_version
            ) order by a.seq
          ), '[]'::jsonb)
          from public.research_lot_reservation_allocations a
          where a.reservation_id = r.id
        )
      ) order by r.reservation_id
    ),
    jsonb_object_agg(r.reservation_id, r.version)
  into v_reservations, v_versions
  from public.research_lot_reservations r
  where r.id = any(v_header_ids);

  v_result := jsonb_build_object(
    'action', 'expire',
    'idempotentReplay', false,
    'reservations', v_reservations
  );
  insert into public.research_inventory_reservation_events (
    action, idempotency_key_hash, command_hash, actor_member_scope_hash,
    reservation_ids, reservation_versions, redacted_result, occurred_at
  ) values (
    'expire', v_idempotency_hash, v_command_hash, v_scope_hash,
    v_ids, v_versions, v_result, p_at
  );
  return v_result;
end;
$$;

alter table public.research_lot_reservations enable row level security;
alter table public.research_lot_reservation_allocations enable row level security;
alter table public.research_inventory_reservation_events enable row level security;
alter table public.research_lot_reservations force row level security;
alter table public.research_lot_reservation_allocations force row level security;
alter table public.research_inventory_reservation_events force row level security;

revoke all on table public.research_lot_reservations
  from public, anon, authenticated;
revoke all on table public.research_lot_reservation_allocations
  from public, anon, authenticated;
revoke all on table public.research_inventory_reservation_events
  from public, anon, authenticated;
revoke all privileges on table public.research_lot_reservations from service_role;
revoke all privileges on table public.research_lot_reservation_allocations from service_role;
revoke all privileges on table public.research_inventory_reservation_events from service_role;

grant select on table
  public.research_lot_reservations,
  public.research_lot_reservation_allocations,
  public.research_inventory_reservation_events
to service_role;

revoke all on function public.research_inventory_reservation_event_immutable()
  from public, anon, authenticated, service_role;
revoke all on function public.research_inventory_readiness_serialization_guard()
  from public, anon, authenticated, service_role;
revoke all on function public.research_inventory_lot_identity_serialization_guard()
  from public, anon, authenticated, service_role;
revoke all on function public.research_reserve_inventory(
  uuid, uuid, jsonb, timestamptz, timestamptz, text
) from public, anon, authenticated, service_role;
revoke all on function public.research_release_inventory_reservations(
  uuid, uuid, text[], timestamptz, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.research_finalize_inventory_reservations(
  uuid, uuid, text[], timestamptz, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.research_expire_inventory_reservations(
  uuid, uuid, text[], timestamptz, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.research_reserve_inventory(
  uuid, uuid, jsonb, timestamptz, timestamptz, text
) to service_role;
grant execute on function public.research_release_inventory_reservations(
  uuid, uuid, text[], timestamptz, text, text
) to service_role;
grant execute on function public.research_finalize_inventory_reservations(
  uuid, uuid, text[], timestamptz, text, text
) to service_role;
grant execute on function public.research_expire_inventory_reservations(
  uuid, uuid, text[], timestamptz, text, text
) to service_role;
