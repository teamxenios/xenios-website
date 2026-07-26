-- Website 4 Research commerce Wave 2: canonical inventory, lot, and exact-lot
-- COA administration.
--
-- Additive and idempotent. Apply after:
--   research-catalog.sql
--   research-inventory-lots.sql
--   research-products-diagnostics.sql
--
-- This migration deliberately extends the canonical tables and creates no
-- parallel operations inventory model.

create extension if not exists pgcrypto;

alter table public.research_inventory_lots
  add column if not exists product_id uuid references public.research_products(id);
alter table public.research_inventory_lots
  add column if not exists variant_id uuid;
alter table public.research_inventory_lots
  add column if not exists storage_location text;
alter table public.research_inventory_lots
  add column if not exists supplier_reference text;
alter table public.research_inventory_lots
  add column if not exists quantity_received integer not null default 0;
alter table public.research_inventory_lots
  add column if not exists quantity_reserved integer not null default 0;
alter table public.research_inventory_lots
  add column if not exists quantity_quarantined integer not null default 0;
alter table public.research_inventory_lots
  add column if not exists quantity_damaged integer not null default 0;
alter table public.research_inventory_lots
  add column if not exists version bigint not null default 1;
alter table public.research_inventory_lots
  add column if not exists reviewed_at timestamptz;
alter table public.research_inventory_lots
  add column if not exists reviewed_by text;
alter table public.research_inventory_lots
  add column if not exists creation_idempotency_key text;
alter table public.research_inventory_lots
  add column if not exists creation_command_hash text;

create unique index if not exists research_inventory_lots_creation_key_idx
  on public.research_inventory_lots(creation_idempotency_key)
  where creation_idempotency_key is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'research_inventory_lots_quantity_invariant'
       and conrelid = 'public.research_inventory_lots'::regclass
  ) then
    alter table public.research_inventory_lots
      add constraint research_inventory_lots_quantity_invariant check (
        quantity_received >= 0
        and quantity_available >= 0
        and quantity_reserved >= 0
        and quantity_quarantined >= 0
        and quantity_damaged >= 0
        and quantity_available
          + quantity_reserved
          + quantity_quarantined
          + quantity_damaged
          <= quantity_received
      );
  end if;
end;
$$;

create index if not exists research_inventory_lots_product_idx
  on public.research_inventory_lots(product_id, variant_id);
create index if not exists research_inventory_lots_location_idx
  on public.research_inventory_lots(storage_location)
  where storage_location is not null;

create table if not exists public.research_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.research_inventory_lots(id),
  movement_type text not null check (movement_type in (
    'receipt',
    'reserve',
    'release',
    'adjust',
    'quarantine',
    'quarantine_release',
    'damage',
    'reconcile'
  )),
  quantity integer not null check (quantity <> 0),
  source_bucket text check (
    source_bucket is null
    or source_bucket in ('available', 'reserved', 'quarantined')
  ),
  available_before integer not null check (available_before >= 0),
  available_after integer not null check (available_after >= 0),
  reserved_before integer not null check (reserved_before >= 0),
  reserved_after integer not null check (reserved_after >= 0),
  quarantined_before integer not null check (quarantined_before >= 0),
  quarantined_after integer not null check (quarantined_after >= 0),
  damaged_before integer not null check (damaged_before >= 0),
  damaged_after integer not null check (damaged_after >= 0),
  resulting_version bigint not null check (resulting_version > 1),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 160),
  command_hash text not null check (char_length(command_hash) = 64),
  reason text not null check (char_length(reason) between 3 and 500),
  actor_id text not null check (char_length(actor_id) between 1 and 200),
  occurred_at timestamptz not null default now()
);
create index if not exists research_inventory_movements_lot_time_idx
  on public.research_inventory_movements(lot_id, occurred_at desc);

create table if not exists public.research_inventory_lot_events (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.research_inventory_lots(id),
  event_type text not null check (event_type in ('created', 'status_changed', 'metadata_updated')),
  from_disposition text,
  to_disposition text not null,
  resulting_version bigint not null check (resulting_version >= 1),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 160),
  command_hash text not null check (char_length(command_hash) = 64),
  actor_id text not null check (char_length(actor_id) between 1 and 200),
  reason text not null check (char_length(reason) between 3 and 500),
  occurred_at timestamptz not null default now()
);
create index if not exists research_inventory_lot_events_lot_time_idx
  on public.research_inventory_lot_events(lot_id, occurred_at desc);

alter table public.research_lot_quality_documents
  add column if not exists bucket_id text not null default 'research-coa-production';
alter table public.research_lot_quality_documents
  add column if not exists original_filename text;
alter table public.research_lot_quality_documents
  add column if not exists content_type text;
alter table public.research_lot_quality_documents
  add column if not exists size_bytes integer;
alter table public.research_lot_quality_documents
  add column if not exists sha256 text;
alter table public.research_lot_quality_documents
  add column if not exists report_issuer text;
alter table public.research_lot_quality_documents
  add column if not exists report_number text;
alter table public.research_lot_quality_documents
  add column if not exists report_date date;
alter table public.research_lot_quality_documents
  add column if not exists review_notes text;
alter table public.research_lot_quality_documents
  add column if not exists reviewed_by text;
alter table public.research_lot_quality_documents
  add column if not exists published_at timestamptz;
alter table public.research_lot_quality_documents
  add column if not exists published_by text;
alter table public.research_lot_quality_documents
  add column if not exists version bigint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'research_lot_quality_document_private_object'
       and conrelid = 'public.research_lot_quality_documents'::regclass
  ) then
    alter table public.research_lot_quality_documents
      add constraint research_lot_quality_document_private_object check (
        (private_storage_key is null
          and original_filename is null
          and content_type is null
          and size_bytes is null
          and sha256 is null)
        or
        (bucket_id = 'research-coa-production'
          and private_storage_key is not null
          and private_storage_key like 'lots/%'
          and original_filename is not null
          and content_type = 'application/pdf'
          and size_bytes between 5 and 20971520
          and sha256 ~ '^[a-f0-9]{64}$')
      );
  end if;
end;
$$;

create table if not exists public.research_lot_quality_tests (
  id uuid primary key default gen_random_uuid(),
  quality_document_id uuid not null
    references public.research_lot_quality_documents(id) on delete cascade,
  test_key text not null check (test_key in (
    'identity',
    'assay',
    'purity',
    'sterility',
    'endotoxin',
    'particulate',
    'residual_solvents',
    'elemental_impurities',
    'chain_of_custody'
  )),
  state text not null default 'not_provided' check (state in (
    'not_provided',
    'not_tested',
    'not_applicable',
    'under_review',
    'passed',
    'failed'
  )),
  method text,
  result text,
  unit text,
  reviewed_by text,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (quality_document_id, test_key),
  check (
    state not in ('passed', 'failed')
    or (method is not null and result is not null and reviewed_by is not null and reviewed_at is not null)
  )
);

create table if not exists public.research_lot_quality_events (
  id uuid primary key default gen_random_uuid(),
  quality_document_id uuid not null
    references public.research_lot_quality_documents(id),
  event_type text not null check (event_type in (
    'upload_referenced',
    'upload_confirmed',
    'submitted_for_review',
    'review_approved',
    'review_rejected',
    'published',
    'withdrawn'
  )),
  from_document_state text,
  to_document_state text not null,
  from_verification_state text,
  to_verification_state text not null,
  resulting_version bigint not null check (resulting_version > 0),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 160),
  command_hash text not null check (char_length(command_hash) = 64),
  actor_id text not null check (char_length(actor_id) between 1 and 200),
  reason text not null check (char_length(reason) between 3 and 500),
  occurred_at timestamptz not null default now()
);
alter table public.research_lot_quality_events
  add column if not exists resulting_version bigint;
update public.research_lot_quality_events as event
   set resulting_version = document.version
  from public.research_lot_quality_documents as document
 where event.quality_document_id = document.id
   and event.resulting_version is null;
alter table public.research_lot_quality_events
  alter column resulting_version set not null;
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'research_lot_quality_events_resulting_version_check'
       and conrelid = 'public.research_lot_quality_events'::regclass
  ) then
    alter table public.research_lot_quality_events
      add constraint research_lot_quality_events_resulting_version_check
      check (resulting_version > 0);
  end if;
end;
$$;
create index if not exists research_lot_quality_events_document_time_idx
  on public.research_lot_quality_events(quality_document_id, occurred_at desc);

create table if not exists public.research_lot_quality_access_events (
  id uuid primary key,
  quality_document_id uuid not null
    references public.research_lot_quality_documents(id),
  document_version bigint not null check (document_version > 0),
  actor_id text not null check (char_length(actor_id) between 1 and 200),
  purpose text not null check (purpose in (
    'quality_review',
    'compliance_review',
    'incident_investigation'
  )),
  occurred_at timestamptz not null default now()
);
create index if not exists research_lot_quality_access_document_time_idx
  on public.research_lot_quality_access_events(
    quality_document_id,
    occurred_at desc
  );

create or replace function public.research_inventory_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'research inventory history is append-only';
end;
$$;

create or replace function public.research_inventory_guard_quantity_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if (new.quantity_received, new.quantity_available, new.quantity_reserved,
      new.quantity_quarantined, new.quantity_damaged)
     is distinct from
     (old.quantity_received, old.quantity_available, old.quantity_reserved,
      old.quantity_quarantined, old.quantity_damaged)
     and coalesce(current_setting('xenios.inventory_command', true), '') <> 'allowed' then
    raise exception 'inventory quantities may change only through an atomic movement command';
  end if;
  return new;
end;
$$;

create or replace function public.research_quality_guard_transition()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('xenios.quality_command', true), '') <> 'allowed'
       or current_user = 'service_role' then
      raise exception 'quality records may change only through a reviewed quality command';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.coa_on_file = true
       or new.document_state <> 'pending'
       or new.verification_state <> 'pending'
       or new.document_ref is not null
       or new.private_storage_key is not null
       or new.original_filename is not null
       or new.content_type is not null
       or new.size_bytes is not null
       or new.sha256 is not null
       or new.report_issuer is not null
       or new.report_number is not null
       or new.report_date is not null
       or new.reviewed_at is not null
       or new.reviewed_by is not null
       or new.published_at is not null
       or new.published_by is not null then
      raise exception 'quality records may change only through a reviewed quality command';
    end if;
  elsif new is distinct from old
        and (
          coalesce(current_setting('xenios.quality_command', true), '') <> 'allowed'
          or current_user = 'service_role'
        ) then
    raise exception 'quality records may change only through a reviewed quality command';
  end if;
  return new;
end;
$$;

create or replace function public.research_quality_test_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT'
     and new.state = 'not_provided'
     and new.method is null
     and new.result is null
     and new.reviewed_by is null
     and new.reviewed_at is null then
    return new;
  end if;
  if coalesce(current_setting('xenios.quality_command', true), '') <> 'allowed'
     or current_user = 'service_role' then
    raise exception 'quality tests may change only through a reviewed quality command';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Accepted Product Control contract:
-- server/research/products-diagnostics/product-commerce-readiness.ts at
-- dd58ccf1fa7919f78838a60aaf66cdee48b73993.
-- This Wave 2 candidate deliberately fails closed until Website 2 injects that
-- exact accepted server reader and an integration migration replaces this hook.
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
  select false;
$$;

create or replace function public.research_lot_quality_tests_ready(
  p_document_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    9 = (
      select count(*)
      from public.research_lot_quality_tests t
      where t.quality_document_id = p_document_id
    )
    and not exists (
      select 1
      from public.research_lot_quality_tests t
      where t.quality_document_id = p_document_id
        and (
          (
            t.test_key in ('identity', 'assay', 'purity', 'chain_of_custody')
            and t.state <> 'passed'
          )
          or (
            t.test_key not in ('identity', 'assay', 'purity', 'chain_of_custody')
            and t.state not in ('passed', 'not_applicable')
          )
        )
    );
$$;

create or replace function public.research_lot_quality_ready(
  p_lot_id uuid,
  p_as_of timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
     from public.research_inventory_lots l
      join public.research_lot_quality_documents d on d.lot_id = l.id
     where l.id = p_lot_id
       and l.product_id is not null
       and l.variant_id is not null
       and public.research_inventory_product_variant_ready(
         l.product_id,
         l.variant_id,
         l.sku
       )
       and l.recalled = false
       and l.excursion in ('none', 'cleared')
       and l.expiry_date is not null
       and l.expiry_date > p_as_of::date
       and (l.retest_date is null or l.retest_date > p_as_of::date)
       and l.shelf_life_source <> 'not_confirmed'
       and d.document_state = 'available'
       and d.verification_state = 'document_on_file'
       and d.coa_on_file = true
       and d.private_storage_key is not null
       and d.report_issuer is not null
       and d.report_number is not null
       and d.report_date is not null
       and d.reviewed_at is not null
       and d.published_at is not null
       and public.research_lot_quality_tests_ready(d.id)
  );
$$;

create or replace function public.research_lot_is_allocatable(
  p_lot_id uuid,
  p_as_of timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
      from public.research_inventory_lots l
     where l.id = p_lot_id
       and l.disposition = 'available'
       and l.quantity_available > 0
       and public.research_lot_quality_ready(l.id, p_as_of)
  );
$$;

create or replace function public.research_apply_inventory_movement(
  p_lot_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_source_bucket text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_reason text,
  p_actor_id text,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  l public.research_inventory_lots%rowtype;
  prior public.research_inventory_movements%rowtype;
  v_hash text;
  v_available integer;
  v_reserved integer;
  v_quarantined integer;
  v_damaged integer;
  v_received integer;
begin
  if p_movement_type not in (
    'receipt', 'reserve', 'release', 'adjust', 'quarantine',
    'quarantine_release', 'damage', 'reconcile'
  ) then
    raise exception 'invalid inventory movement';
  end if;
  if p_quantity = 0 or abs(p_quantity) > 100000000 then
    raise exception 'invalid inventory quantity';
  end if;
  if p_movement_type not in ('adjust', 'reconcile') and p_quantity < 1 then
    raise exception 'inventory quantity must be positive';
  end if;
  if char_length(coalesce(p_reason, '')) < 3
     or char_length(coalesce(p_idempotency_key, '')) < 8
     or char_length(coalesce(p_actor_id, '')) < 1 then
    raise exception 'inventory command metadata is incomplete';
  end if;

  v_hash := encode(extensions.digest(
    concat_ws('|', p_lot_id::text, p_movement_type, p_quantity::text,
      coalesce(p_source_bucket, ''), p_expected_version::text, p_reason, p_actor_id),
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select * into l
    from public.research_inventory_lots
   where id = p_lot_id
   for update;
  if not found then raise exception 'inventory lot not found'; end if;

  select * into prior
    from public.research_inventory_movements
   where idempotency_key = p_idempotency_key;
  if found then
    if prior.command_hash <> v_hash then
      raise exception 'idempotency key was reused for a different inventory command';
    end if;
    return jsonb_build_object(
      'movementId', prior.id,
      'lotId', prior.lot_id,
      'version', prior.resulting_version,
      'idempotentReplay', true,
      'quantityAvailable', prior.available_after,
      'quantityReserved', prior.reserved_after,
      'quantityQuarantined', prior.quarantined_after,
      'quantityDamaged', prior.damaged_after
    );
  end if;

  if l.version <> p_expected_version then
    raise exception 'inventory lot version conflict';
  end if;

  v_available := l.quantity_available;
  v_reserved := l.quantity_reserved;
  v_quarantined := l.quantity_quarantined;
  v_damaged := l.quantity_damaged;
  v_received := l.quantity_received;

  case p_movement_type
    when 'receipt' then
      v_received := v_received + p_quantity;
      v_available := v_available + p_quantity;
    when 'reserve' then
      if not public.research_lot_is_allocatable(l.id, p_occurred_at) then
        raise exception 'lot is not allocatable';
      end if;
      if v_available < p_quantity then raise exception 'insufficient available quantity'; end if;
      v_available := v_available - p_quantity;
      v_reserved := v_reserved + p_quantity;
    when 'release' then
      if v_reserved < p_quantity then raise exception 'insufficient reserved quantity'; end if;
      v_reserved := v_reserved - p_quantity;
      v_available := v_available + p_quantity;
    when 'adjust' then
      if p_source_bucket <> 'available' then
        raise exception 'adjust is an explicit available-quantity delta';
      end if;
      if v_available + p_quantity < 0 then
        raise exception 'adjustment would make available quantity negative';
      end if;
      v_available := v_available + p_quantity;
      v_received := v_received + p_quantity;
      if v_received < 0 then raise exception 'adjustment would make received quantity negative'; end if;
    when 'quarantine' then
      if v_available < p_quantity then raise exception 'insufficient available quantity'; end if;
      v_available := v_available - p_quantity;
      v_quarantined := v_quarantined + p_quantity;
    when 'quarantine_release' then
      if v_quarantined < p_quantity then raise exception 'insufficient quarantined quantity'; end if;
      v_quarantined := v_quarantined - p_quantity;
      v_available := v_available + p_quantity;
    when 'damage' then
      if p_source_bucket = 'available' then
        if v_available < p_quantity then raise exception 'insufficient available quantity'; end if;
        v_available := v_available - p_quantity;
      elsif p_source_bucket = 'reserved' then
        if v_reserved < p_quantity then raise exception 'insufficient reserved quantity'; end if;
        v_reserved := v_reserved - p_quantity;
      elsif p_source_bucket = 'quarantined' then
        if v_quarantined < p_quantity then raise exception 'insufficient quarantined quantity'; end if;
        v_quarantined := v_quarantined - p_quantity;
      else
        raise exception 'damage requires an exact source bucket';
      end if;
      v_damaged := v_damaged + p_quantity;
    when 'reconcile' then
      if p_source_bucket <> 'available' then
        raise exception 'reconcile is an explicit available-quantity delta';
      end if;
      if v_available + p_quantity < 0 then
        raise exception 'reconciliation would make available quantity negative';
      end if;
      v_available := v_available + p_quantity;
      v_received := v_received + p_quantity;
      if v_received < v_available + v_reserved + v_quarantined + v_damaged then
        raise exception 'reconciliation would violate exact quantity invariants';
      end if;
  end case;

  perform set_config('xenios.inventory_command', 'allowed', true);
  update public.research_inventory_lots
     set quantity_received = v_received,
         quantity_available = v_available,
         quantity_reserved = v_reserved,
         quantity_quarantined = v_quarantined,
         quantity_damaged = v_damaged,
         version = version + 1,
         updated_at = p_occurred_at
   where id = l.id;

  insert into public.research_inventory_movements (
    lot_id, movement_type, quantity, source_bucket,
    available_before, available_after, reserved_before, reserved_after,
    quarantined_before, quarantined_after, damaged_before, damaged_after,
    resulting_version, idempotency_key, command_hash, reason, actor_id, occurred_at
  )
  values (
    l.id, p_movement_type, p_quantity, p_source_bucket,
    l.quantity_available, v_available, l.quantity_reserved, v_reserved,
    l.quantity_quarantined, v_quarantined, l.quantity_damaged, v_damaged,
    l.version + 1, p_idempotency_key, v_hash, p_reason, p_actor_id, p_occurred_at
  )
  returning * into prior;

  return jsonb_build_object(
    'movementId', prior.id,
    'lotId', l.id,
    'version', l.version + 1,
    'idempotentReplay', false,
    'quantityAvailable', v_available,
    'quantityReserved', v_reserved,
    'quantityQuarantined', v_quarantined,
    'quantityDamaged', v_damaged
  );
end;
$$;

create or replace function public.research_set_inventory_lot_disposition(
  p_lot_id uuid,
  p_disposition text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_reason text,
  p_actor_id text,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  l public.research_inventory_lots%rowtype;
  prior public.research_inventory_lot_events%rowtype;
  v_hash text;
begin
  if p_disposition not in (
    'available', 'allocated', 'picked', 'packed', 'shipped',
    'quarantined', 'quality_hold', 'temperature_hold',
    'damaged', 'expired', 'recalled', 'destroyed'
  ) then
    raise exception 'invalid lot disposition';
  end if;
  if char_length(coalesce(p_reason, '')) < 3
     or char_length(coalesce(p_idempotency_key, '')) < 8
     or char_length(coalesce(p_actor_id, '')) < 1 then
    raise exception 'lot status metadata is incomplete';
  end if;
  v_hash := encode(extensions.digest(
    concat_ws('|', p_lot_id::text, p_disposition, p_expected_version::text, p_reason, p_actor_id),
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select * into l
    from public.research_inventory_lots
   where id = p_lot_id
   for update;
  if not found then raise exception 'inventory lot not found'; end if;

  select * into prior
    from public.research_inventory_lot_events
   where idempotency_key = p_idempotency_key;
  if found then
    if prior.command_hash <> v_hash then
      raise exception 'idempotency key was reused for a different lot command';
    end if;
    return jsonb_build_object(
      'lotId', prior.lot_id,
      'disposition', prior.to_disposition,
      'version', prior.resulting_version,
      'idempotentReplay', true
    );
  end if;

  if l.version <> p_expected_version then raise exception 'inventory lot version conflict'; end if;
  if p_disposition = 'available'
     and not public.research_lot_quality_ready(l.id, p_occurred_at) then
    raise exception 'lot cannot be released until exact-lot quality gates pass';
  end if;

  update public.research_inventory_lots
     set disposition = p_disposition,
         version = version + 1,
         reviewed_at = p_occurred_at,
         reviewed_by = p_actor_id,
         updated_at = p_occurred_at
   where id = l.id;

  insert into public.research_inventory_lot_events (
    lot_id, event_type, from_disposition, to_disposition,
    resulting_version, idempotency_key, command_hash,
    actor_id, reason, occurred_at
  ) values (
    l.id, 'status_changed', l.disposition, p_disposition,
    l.version + 1, p_idempotency_key, v_hash,
    p_actor_id, p_reason, p_occurred_at
  );

  return jsonb_build_object(
    'lotId', l.id,
    'disposition', p_disposition,
    'version', l.version + 1,
    'idempotentReplay', false
  );
end;
$$;

create or replace function public.research_manage_lot_quality_document(
  p_document_id uuid,
  p_action text,
  p_tests jsonb,
  p_expected_version bigint,
  p_idempotency_key text,
  p_reason text,
  p_actor_id text,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  d public.research_lot_quality_documents%rowtype;
  prior public.research_lot_quality_events%rowtype;
  item jsonb;
  v_hash text;
  v_document_state text;
  v_verification_state text;
  v_event_type text;
begin
  if p_action not in ('replace_upload', 'confirm_upload', 'approve', 'reject', 'publish', 'withdraw') then
    raise exception 'invalid lot quality action';
  end if;
  if char_length(coalesce(p_reason, '')) < 3
     or char_length(coalesce(p_idempotency_key, '')) < 8
     or char_length(coalesce(p_actor_id, '')) < 1 then
    raise exception 'lot quality command metadata is incomplete';
  end if;
  v_hash := encode(extensions.digest(
    concat_ws('|', p_document_id::text, p_action, coalesce(p_tests, '[]'::jsonb)::text,
      p_expected_version::text, p_reason, p_actor_id),
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select * into d
    from public.research_lot_quality_documents
   where id = p_document_id
   for update;
  if not found then raise exception 'lot quality document not found'; end if;

  select * into prior
    from public.research_lot_quality_events
   where idempotency_key = p_idempotency_key;
  if found then
    if prior.command_hash <> v_hash then
      raise exception 'idempotency key was reused for a different quality command';
    end if;
    return jsonb_build_object(
      'documentId', prior.quality_document_id,
      'documentState', prior.to_document_state,
      'verificationState', prior.to_verification_state,
      'version', prior.resulting_version,
      'idempotentReplay', true
    );
  end if;

  if d.version <> p_expected_version then raise exception 'lot quality document version conflict'; end if;

  if d.published_at is not null and p_action <> 'withdraw' then
    raise exception 'published COA records are immutable; withdraw before replacement';
  end if;

  perform set_config('xenios.quality_command', 'allowed', true);
  if p_action = 'replace_upload' then
    if jsonb_typeof(p_tests) <> 'object' then
      raise exception 'replacement upload metadata must be an object';
    end if;
  else
    if p_tests is null then p_tests := '[]'::jsonb; end if;
    if jsonb_typeof(p_tests) <> 'array' then raise exception 'quality tests must be an array'; end if;
    if p_action <> 'approve' and jsonb_array_length(p_tests) <> 0 then
      raise exception 'quality tests may change only during approval';
    end if;
    for item in select value from jsonb_array_elements(p_tests)
    loop
      insert into public.research_lot_quality_tests (
        quality_document_id, test_key, state, method, result, unit,
        reviewed_by, reviewed_at, updated_at
      ) values (
        d.id,
        item->>'testKey',
        item->>'state',
        nullif(item->>'method', ''),
        nullif(item->>'result', ''),
        nullif(item->>'unit', ''),
        case when item->>'state' in ('passed', 'failed') then p_actor_id else null end,
        case when item->>'state' in ('passed', 'failed') then p_occurred_at else null end,
        p_occurred_at
      )
      on conflict (quality_document_id, test_key) do update set
        state = excluded.state,
        method = excluded.method,
        result = excluded.result,
        unit = excluded.unit,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = excluded.reviewed_at,
        updated_at = excluded.updated_at;
    end loop;
  end if;

  v_document_state := d.document_state;
  v_verification_state := d.verification_state;
  case p_action
    when 'replace_upload' then
      if d.coa_on_file
         or d.document_state <> 'pending'
         or d.verification_state <> 'pending'
         or p_tests->>'bucketId' <> 'research-coa-production'
         or p_tests->>'storageKey' not like ('lots/' || d.lot_id::text || '/%')
         or p_tests->>'documentRef' <> p_tests->>'storageKey'
         or char_length(coalesce(p_tests->>'originalFilename', '')) < 1
         or p_tests->>'contentType' <> 'application/pdf'
         or (p_tests->>'sizeBytes')::integer not between 5 and 20971520
         or coalesce(p_tests->>'sha256', '') !~ '^[a-f0-9]{64}$'
         or char_length(coalesce(p_tests->>'reportIssuer', '')) < 2
         or char_length(coalesce(p_tests->>'reportNumber', '')) < 2
         or nullif(p_tests->>'reportDate', '')::date is null then
        raise exception 'replacement upload metadata is incomplete';
      end if;
      v_event_type := 'upload_referenced';
    when 'confirm_upload' then
      if d.private_storage_key is null
         or d.sha256 is null
         or d.report_issuer is null
         or d.report_number is null
         or d.report_date is null then
        raise exception 'private COA object reference is incomplete';
      end if;
      v_event_type := 'upload_confirmed';
    when 'approve' then
      if d.coa_on_file = false then raise exception 'COA upload is not confirmed'; end if;
      if not public.research_lot_quality_tests_ready(d.id) then
        raise exception 'required exact-lot quality tests are not approved';
      end if;
      v_document_state := 'available';
      v_verification_state := 'document_on_file';
      v_event_type := 'review_approved';
    when 'reject' then
      v_document_state := 'withdrawn';
      v_verification_state := 'withdrawn';
      v_event_type := 'review_rejected';
    when 'publish' then
      if d.document_state <> 'available'
         or d.verification_state <> 'document_on_file'
         or d.reviewed_at is null
         or not public.research_lot_quality_tests_ready(d.id) then
        raise exception 'only an approved COA can be published';
      end if;
      v_event_type := 'published';
    when 'withdraw' then
      v_document_state := 'withdrawn';
      v_verification_state := 'withdrawn';
      v_event_type := 'withdrawn';
  end case;

  update public.research_lot_quality_documents
     set coa_on_file = case when p_action = 'confirm_upload' then true else coa_on_file end,
         document_state = v_document_state,
         verification_state = v_verification_state,
         document_ref = case when p_action = 'replace_upload' then p_tests->>'documentRef' else document_ref end,
         bucket_id = case when p_action = 'replace_upload' then p_tests->>'bucketId' else bucket_id end,
         private_storage_key = case when p_action = 'replace_upload' then p_tests->>'storageKey' else private_storage_key end,
         original_filename = case when p_action = 'replace_upload' then p_tests->>'originalFilename' else original_filename end,
         content_type = case when p_action = 'replace_upload' then p_tests->>'contentType' else content_type end,
         size_bytes = case when p_action = 'replace_upload' then (p_tests->>'sizeBytes')::integer else size_bytes end,
         sha256 = case when p_action = 'replace_upload' then p_tests->>'sha256' else sha256 end,
         report_issuer = case when p_action = 'replace_upload' then p_tests->>'reportIssuer' else report_issuer end,
         report_number = case when p_action = 'replace_upload' then p_tests->>'reportNumber' else report_number end,
         report_date = case when p_action = 'replace_upload' then (p_tests->>'reportDate')::date else report_date end,
         recorded_at = case when p_action = 'replace_upload' then p_occurred_at else recorded_at end,
         reviewed_at = case when p_action in ('approve', 'reject') then p_occurred_at else reviewed_at end,
         reviewed_by = case when p_action in ('approve', 'reject') then p_actor_id else reviewed_by end,
         review_notes = case when p_action in ('approve', 'reject') then p_reason else review_notes end,
         published_at = case when p_action = 'publish' then p_occurred_at when p_action = 'withdraw' then null else published_at end,
         published_by = case when p_action = 'publish' then p_actor_id when p_action = 'withdraw' then null else published_by end,
         version = version + 1
   where id = d.id;
  perform set_config('xenios.quality_command', '', true);

  insert into public.research_lot_quality_events (
    quality_document_id, event_type,
    from_document_state, to_document_state,
    from_verification_state, to_verification_state,
    resulting_version, idempotency_key, command_hash, actor_id, reason, occurred_at
  ) values (
    d.id, v_event_type,
    d.document_state, v_document_state,
    d.verification_state, v_verification_state,
    d.version + 1, p_idempotency_key, v_hash, p_actor_id, p_reason, p_occurred_at
  );

  return jsonb_build_object(
    'documentId', d.id,
    'documentState', v_document_state,
    'verificationState', v_verification_state,
    'version', d.version + 1,
    'idempotentReplay', false
  );
end;
$$;

create or replace function public.research_authorize_lot_quality_access(
  p_document_id uuid,
  p_actor_id text,
  p_purpose text,
  p_access_id uuid,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  d public.research_lot_quality_documents%rowtype;
begin
  if char_length(coalesce(p_actor_id, '')) < 1
     or p_purpose not in (
       'quality_review',
       'compliance_review',
       'incident_investigation'
     )
     or p_access_id is null then
    raise exception 'private COA access metadata is incomplete';
  end if;

  select * into d
    from public.research_lot_quality_documents
   where id = p_document_id
   for share;
  if not found
     or d.document_state <> 'available'
     or d.verification_state <> 'document_on_file'
     or not d.coa_on_file
     or d.published_at is null
     or d.bucket_id <> 'research-coa-production'
     or d.private_storage_key is null then
    raise exception 'private COA is not currently authorized for access';
  end if;

  insert into public.research_lot_quality_access_events (
    id,
    quality_document_id,
    document_version,
    actor_id,
    purpose,
    occurred_at
  ) values (
    p_access_id,
    d.id,
    d.version,
    p_actor_id,
    p_purpose,
    p_occurred_at
  );

  return jsonb_build_object(
    'accessEventId', p_access_id,
    'bucketId', d.bucket_id,
    'storageKey', d.private_storage_key,
    'documentVersion', d.version
  );
end;
$$;

drop trigger if exists research_inventory_lots_quantity_command_only
  on public.research_inventory_lots;
create trigger research_inventory_lots_quantity_command_only
  before update on public.research_inventory_lots
  for each row execute function public.research_inventory_guard_quantity_update();

drop trigger if exists research_lot_quality_document_command_only
  on public.research_lot_quality_documents;
create trigger research_lot_quality_document_command_only
  before insert or update or delete on public.research_lot_quality_documents
  for each row execute function public.research_quality_guard_transition();

drop trigger if exists research_lot_quality_tests_command_only
  on public.research_lot_quality_tests;
create trigger research_lot_quality_tests_command_only
  before insert or update or delete on public.research_lot_quality_tests
  for each row execute function public.research_quality_test_guard();

drop trigger if exists research_inventory_movements_no_update
  on public.research_inventory_movements;
create trigger research_inventory_movements_no_update
  before update or delete on public.research_inventory_movements
  for each row execute function public.research_inventory_append_only();

drop trigger if exists research_lot_quality_events_no_update
  on public.research_lot_quality_events;
create trigger research_lot_quality_events_no_update
  before update or delete on public.research_lot_quality_events
  for each row execute function public.research_inventory_append_only();

drop trigger if exists research_lot_quality_access_events_no_update
  on public.research_lot_quality_access_events;
create trigger research_lot_quality_access_events_no_update
  before update or delete on public.research_lot_quality_access_events
  for each row execute function public.research_inventory_append_only();

drop trigger if exists research_inventory_lot_events_no_update
  on public.research_inventory_lot_events;
create trigger research_inventory_lot_events_no_update
  before update or delete on public.research_inventory_lot_events
  for each row execute function public.research_inventory_append_only();

alter table public.research_inventory_lots enable row level security;
alter table public.research_lot_quality_documents enable row level security;
alter table public.research_lot_allocations enable row level security;
alter table public.research_inventory_movements enable row level security;
alter table public.research_inventory_lot_events enable row level security;
alter table public.research_lot_quality_tests enable row level security;
alter table public.research_lot_quality_events enable row level security;
alter table public.research_lot_quality_access_events enable row level security;

alter table public.research_inventory_lots force row level security;
alter table public.research_lot_quality_documents force row level security;
alter table public.research_lot_allocations force row level security;
alter table public.research_inventory_movements force row level security;
alter table public.research_inventory_lot_events force row level security;
alter table public.research_lot_quality_tests force row level security;
alter table public.research_lot_quality_events force row level security;
alter table public.research_lot_quality_access_events force row level security;

revoke all on table public.research_inventory_lots
  from public, anon, authenticated;
revoke all on table public.research_lot_quality_documents
  from public, anon, authenticated;
revoke all on table public.research_lot_allocations
  from public, anon, authenticated;
revoke all on table public.research_inventory_movements
  from public, anon, authenticated;
revoke all on table public.research_inventory_lot_events
  from public, anon, authenticated;
revoke all on table public.research_lot_quality_tests
  from public, anon, authenticated;
revoke all on table public.research_lot_quality_events
  from public, anon, authenticated;
revoke all on table public.research_lot_quality_access_events
  from public, anon, authenticated;

revoke all on function public.research_inventory_append_only()
  from public, anon, authenticated;
revoke all on function public.research_inventory_guard_quantity_update()
  from public, anon, authenticated;
revoke all on function public.research_quality_guard_transition()
  from public, anon, authenticated;
revoke all on function public.research_quality_test_guard()
  from public, anon, authenticated;
revoke all on function public.research_inventory_product_variant_ready(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.research_lot_quality_tests_ready(uuid)
  from public, anon, authenticated;
revoke all on function public.research_authorize_lot_quality_access(uuid, text, text, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.research_lot_is_allocatable(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.research_lot_quality_ready(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.research_apply_inventory_movement(
  uuid, text, integer, text, bigint, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.research_set_inventory_lot_disposition(
  uuid, text, bigint, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.research_manage_lot_quality_document(
  uuid, text, jsonb, bigint, text, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.research_inventory_product_variant_ready(uuid, uuid, text)
  to service_role;
grant execute on function public.research_lot_quality_tests_ready(uuid)
  to service_role;
grant execute on function public.research_authorize_lot_quality_access(uuid, text, text, uuid, timestamptz)
  to service_role;
grant execute on function public.research_lot_is_allocatable(uuid, timestamptz)
  to service_role;
grant execute on function public.research_lot_quality_ready(uuid, timestamptz)
  to service_role;
grant execute on function public.research_apply_inventory_movement(
  uuid, text, integer, text, bigint, text, text, text, timestamptz
) to service_role;
grant execute on function public.research_set_inventory_lot_disposition(
  uuid, text, bigint, text, text, text, timestamptz
) to service_role;
grant execute on function public.research_manage_lot_quality_document(
  uuid, text, jsonb, bigint, text, text, text, timestamptz
) to service_role;

revoke all privileges on table public.research_inventory_lots from service_role;
revoke all privileges on table public.research_lot_quality_documents from service_role;
revoke all privileges on table public.research_lot_allocations from service_role;
revoke all privileges on table public.research_inventory_movements from service_role;
revoke all privileges on table public.research_inventory_lot_events from service_role;
revoke all privileges on table public.research_lot_quality_tests from service_role;
revoke all privileges on table public.research_lot_quality_events from service_role;
revoke all privileges on table public.research_lot_quality_access_events from service_role;

-- The service role reads canonical state, inserts new lot/document/test records,
-- and executes the security-definer commands above. Quantity, disposition,
-- review, and publication transitions cannot be performed as direct table
-- updates, so application code cannot bypass version/idempotency/audit gates.

grant select, insert on table public.research_inventory_lots
  to service_role;
grant select, insert on table public.research_lot_quality_documents
  to service_role;
grant select on table public.research_lot_allocations
  to service_role;
grant select on table public.research_inventory_movements
  to service_role;
grant select on table public.research_inventory_lot_events
  to service_role;
grant select, insert on table public.research_lot_quality_tests
  to service_role;
grant select on table public.research_lot_quality_events
  to service_role;
grant select on table public.research_lot_quality_access_events
  to service_role;
